import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { z } from 'zod';

import {
  type DatabaseSchemaSnapshot,
  type SchemaTable,
  DatasourceAnalysisService,
  specificationExtractionChunkCandidates,
  specificationExtractionChunks,
} from '../datasource-analysis.service';
import { LlmTask } from '../../llm/enums/llm-task.enum';
import { LlmService } from '../../llm/llm.service';
import { EmbeddingService } from './embedding.service';
import {
  CompatibilityStatus,
  DatabaseSpecFindingSeverity,
  DatabaseSpecFindingType,
  KnowledgeEligibilityStatus,
} from './datasource-knowledge.enums';

const requirementSchema = z.object({
  description: z.string().min(1).max(1_000),
  entity: z.string().min(1).max(240),
  fields: z.array(z.object({ name: z.string().min(1).max(240), required: z.boolean(), unique: z.boolean() })).max(30),
  id: z.string().min(1).max(128),
  importance: z.number().int().min(1).max(100),
  relationships: z.array(z.object({ fromEntity: z.string().min(1).max(240), toEntity: z.string().min(1).max(240) })).max(10),
});

const extractionSchema = z.object({
  extractionConfidence: z.number().min(0).max(1),
  isDatabaseRelevant: z.boolean(),
  requirements: z.array(requirementSchema).max(20),
});

const chunkExtractionSchema = extractionSchema.extend({
  requirements: z.array(requirementSchema).max(3),
});

const MAX_SEMANTIC_RETRIEVAL_CANDIDATES = 48;
const SEMANTIC_LEXICAL_SCORE_WEIGHT = 0.15;

const expectedModelSchema = z.object({
  entities: z.array(z.object({ fields: z.array(z.string().min(1).max(240)).max(30), name: z.string().min(1).max(240) })).max(20),
});

const semanticMatchSchema = z.object({
  matches: z.array(z.object({ confidence: z.number().min(0).max(1), requirementId: z.string().min(1).max(128), status: z.enum(['MATCHED', 'PARTIAL', 'MISSING']), tableName: z.string().min(1).max(128).nullable() })).max(20),
});

type ExtractedRequirement = z.infer<typeof requirementSchema>;

interface CompatibilityFindingDraft {
  findingType: DatabaseSpecFindingType;
  severity: DatabaseSpecFindingSeverity;
  requirementId: string | null;
  tableName: string | null;
  columnName: string | null;
  relationshipName: string | null;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  recommendation: string | null;
  confidenceScore: number;
}

export interface EntityMappingDraft {
  requirementId: string;
  specEntity: string;
  tableName: string;
  matchType: string;
  confidenceScore: number;
  verified: boolean;
}

export interface FieldMappingDraft {
  requirementId: string;
  specField: string;
  tableName: string;
  columnName: string;
  matchType: string;
  confidenceScore: number;
  verified: boolean;
}

export interface RelationshipMappingDraft {
  requirementId: string;
  relationshipName: string;
  sourceTableName: string;
  targetTableName: string;
  matchType: string;
  confidenceScore: number;
  verified: boolean;
}

export interface DetailedCompatibilityAnalysis {
  snapshot: DatabaseSchemaSnapshot;
  extractionConfidence: number;
  requirements: ExtractedRequirement[];
  expectedModel: Record<string, unknown>;
  findings: CompatibilityFindingDraft[];
  entityMappings: EntityMappingDraft[];
  fieldMappings: FieldMappingDraft[];
  relationshipMappings: RelationshipMappingDraft[];
  overallScore: number;
  entityScore: number;
  fieldScore: number;
  relationshipScore: number;
  constraintScore: number;
  semanticScore: number;
  anchorScore: number;
  status: CompatibilityStatus;
  knowledgeEligibility: KnowledgeEligibilityStatus;
  reason: string;
  summary: Record<string, number>;
}

@Injectable()
export class DatasourceCompatibilityService {
  constructor(
    private readonly analysis: DatasourceAnalysisService,
    private readonly llm: LlmService,
    private readonly embeddings: EmbeddingService,
    @InjectPinoLogger(DatasourceCompatibilityService.name) private readonly logger: PinoLogger,
  ) {}

  async analyze(
    organizationId: string,
    datasourceId: string,
    databaseName: string,
    specification: string,
  ): Promise<DetailedCompatibilityAnalysis> {
    const startedAt = Date.now();
    this.logger.info({ datasourceId }, 'Datasource compatibility analysis started');
    const snapshot = await this.analysis.captureSchemaSnapshot(organizationId, datasourceId, databaseName);
    this.logger.info(
      { datasourceId, schemaTableCount: snapshot.tables.length, schemaTruncated: snapshot.truncated },
      'Datasource schema snapshot captured',
    );
    const extractionChunks = await this.selectExtractionChunks(
      specification,
      snapshot,
      datasourceId,
    );
    const extractions: z.infer<typeof extractionSchema>[] = [];
    this.logger.info(
      { datasourceId, specificationChunkCount: extractionChunks.length },
      'Datasource specification requirement extraction started',
    );
    for (const [index, chunk] of extractionChunks.entries()) {
      this.logger.info(
        { datasourceId, specificationChunkCount: extractionChunks.length, specificationChunkIndex: index + 1 },
        'Datasource specification extraction chunk started',
      );
      const extraction = await this.llm.generateStructured({
        datasourceId,
        messages: [
          systemMessage('Extract no more than three assessable data-model requirements from this Markdown excerpt. Each requirement must name a concrete domain entity or table and a field, relationship, or constraint that can be checked against database metadata. Ignore source-code instructions, file references, framework annotations, type declarations, investigation notes, and generic conventions such as primary-key or timestamp advice. Do not infer customer records or credentials.'),
          { content: chunk, role: 'user' },
        ],
        organizationId,
        schema: chunkExtractionSchema,
        schemaName: 'specification_requirement_extraction_chunk',
        task: LlmTask.SpecRequirementExtraction,
      });
      extractions.push(extraction.data);
      this.logger.info(
        { datasourceId, requirementCount: extraction.data.requirements.length, specificationChunkIndex: index + 1 },
        'Datasource specification extraction chunk completed',
      );
    }
    const extraction = mergeExtractions(extractions);
    this.logger.info(
      {
        datasourceId,
        extractionConfidence: extraction.extractionConfidence,
        requirementCount: extraction.requirements.length,
      },
      'Datasource specification requirements extracted',
    );
    this.logger.info({ datasourceId }, 'Datasource expected model generation started');
    const expected = await this.llm.generateStructured({
      datasourceId,
      messages: [
        systemMessage('Build a concise expected data model only from the extracted requirements.'),
        { content: JSON.stringify(extraction.requirements), role: 'user' },
      ],
      organizationId,
      schema: expectedModelSchema,
      schemaName: 'specification_expected_model',
      task: LlmTask.SpecExpectedModelBuilding,
    });
    this.logger.info({ datasourceId }, 'Datasource expected model generated');
    const candidates = candidateTables(snapshot.tables, extraction.requirements);
    this.logger.info(
      { candidateTableCount: candidates.length, datasourceId },
      'Datasource semantic matching started',
    );
    const semantic = await this.llm.generateStructured({
      datasourceId,
      messages: [
        systemMessage('Match each requirement only to one supplied candidate table. Return MISSING when no candidate is supported. Do not claim database facts that are absent from the metadata.'),
        {
          content: JSON.stringify({
            candidateTables: candidates,
            requirements: extraction.requirements,
          }),
          role: 'user',
        },
      ],
      organizationId,
      schema: semanticMatchSchema,
      schemaName: 'specification_semantic_matches',
      task: LlmTask.SpecSemanticMatching,
    });
    const result = this.compare(snapshot, extraction, expected.data, semantic.data.matches);
    this.logger.info(
      { datasourceId, durationMs: Date.now() - startedAt, overallScore: result.overallScore },
      'Datasource compatibility analysis completed',
    );
    return result;
  }

  private async selectExtractionChunks(
    specification: string,
    snapshot: DatabaseSchemaSnapshot,
    datasourceId: string,
  ): Promise<string[]> {
    const terms = snapshot.tables.map((table) => table.name);
    const fallback = specificationExtractionChunks(specification, terms);
    const candidates = semanticCandidates(specificationExtractionChunkCandidates(specification, terms));
    if (snapshot.tables.length === 0 || candidates.length <= fallback.length) return fallback;

    const startedAt = Date.now();
    this.logger.info(
      { datasourceId, semanticCandidateChunkCount: candidates.length },
      'Datasource semantic context selection started',
    );
    try {
      const tableCount = snapshot.tables.length;
      const vectors = await this.embeddings.embed([
        ...snapshot.tables.map(schemaEmbeddingText),
        ...candidates.map((candidate) => candidate.text),
      ]);
      const tableVectors = vectors.slice(0, tableCount);
      const chunkVectors = vectors.slice(tableCount);
      const maximumLexicalScore = Math.max(1, ...candidates.map((candidate) => candidate.lexicalScore));
      const [firstCandidate, ...remainingCandidates] = candidates;
      if (!firstCandidate) return fallback;

      const selected = [
        firstCandidate,
        ...remainingCandidates
          .map((candidate, index) => ({
            candidate,
            score:
              maxCosineSimilarity(chunkVectors[index + 1], tableVectors) +
              (candidate.lexicalScore / maximumLexicalScore) * SEMANTIC_LEXICAL_SCORE_WEIGHT,
          }))
          .sort((left, right) => right.score - left.score || left.candidate.index - right.candidate.index)
          .slice(0, fallback.length - 1)
          .map(({ candidate }) => candidate),
      ]
        .sort((left, right) => left.index - right.index)
        .map((candidate) => candidate.text);
      this.logger.info(
        { datasourceId, durationMs: Date.now() - startedAt, specificationChunkCount: selected.length },
        'Datasource semantic context selection completed',
      );
      return selected;
    } catch (error) {
      this.logger.warn(
        { datasourceId, errorType: error instanceof Error ? error.name : 'UnknownError' },
        'Datasource semantic context selection failed; using lexical selection',
      );
      return fallback;
    }
  }

  async reanalyzeExtracted(
    organizationId: string,
    datasourceId: string,
    databaseName: string,
    extractionConfidence: number,
    requirements: Record<string, unknown>[],
    expectedModel: Record<string, unknown>,
  ): Promise<DetailedCompatibilityAnalysis> {
    const parsedRequirements = z.array(requirementSchema).max(20).parse(requirements);
    this.logger.info({ datasourceId }, 'Datasource compatibility refresh started');
    const snapshot = await this.analysis.captureSchemaSnapshot(organizationId, datasourceId, databaseName);
    this.logger.info(
      { datasourceId, schemaTableCount: snapshot.tables.length, schemaTruncated: snapshot.truncated },
      'Datasource schema snapshot captured',
    );
    this.logger.info({ datasourceId }, 'Datasource semantic matching started');
    const semantic = await this.llm.generateStructured({
      datasourceId,
      messages: [
        systemMessage('Match each requirement only to one supplied candidate table. Return MISSING when no candidate is supported. Do not claim database facts that are absent from the metadata.'),
        { content: JSON.stringify({ candidateTables: candidateTables(snapshot.tables, parsedRequirements), requirements: parsedRequirements }), role: 'user' },
      ],
      organizationId,
      schema: semanticMatchSchema,
      schemaName: 'specification_semantic_matches',
      task: LlmTask.SpecSemanticMatching,
    });
    return this.compare(
      snapshot,
      { extractionConfidence, isDatabaseRelevant: parsedRequirements.length > 0, requirements: parsedRequirements },
      expectedModel,
      semantic.data.matches,
    );
  }

  private compare(
    snapshot: DatabaseSchemaSnapshot,
    extraction: z.infer<typeof extractionSchema>,
    expectedModel: Record<string, unknown>,
    semanticMatches: z.infer<typeof semanticMatchSchema>['matches'],
  ): DetailedCompatibilityAnalysis {
    const tableByName = new Map(snapshot.tables.map((table) => [table.name, table]));
    const semanticByRequirement = new Map(semanticMatches.map((match) => [match.requirementId, match]));
    const findings: CompatibilityFindingDraft[] = [];
    const entityMappings: EntityMappingDraft[] = [];
    const fieldMappings: FieldMappingDraft[] = [];
    const relationshipMappings: RelationshipMappingDraft[] = [];
    let entityTotal = 0;
    let entityPoints = 0;
    let fieldTotal = 0;
    let fieldPoints = 0;
    let constraintTotal = 0;
    let constraintPoints = 0;
    let relationshipTotal = 0;
    let relationshipPoints = 0;
    let anchorTotal = 0;
    let anchorPoints = 0;

    for (const requirement of extraction.requirements) {
      entityTotal += 1;
      if (requirement.importance >= 70) anchorTotal += 1;
      const semantic = semanticByRequirement.get(requirement.id);
      const table = this.matchedTable(requirement, semantic, snapshot.tables, tableByName);
      const status = table ? semantic?.status ?? 'MATCHED' : 'MISSING';
      const points = status === 'MATCHED' ? 1 : status === 'PARTIAL' ? 0.5 : 0;
      entityPoints += points;
      if (requirement.importance >= 70) anchorPoints += points;
      const confidence = table ? Math.max(semantic?.confidence ?? 0.8, status === 'MATCHED' ? 0.8 : 0.5) : 0.9;
      if (table && status !== 'MISSING') {
        entityMappings.push({
          confidenceScore: confidence,
          matchType: semantic?.status ?? 'EXACT_NAME',
          requirementId: requirement.id,
          specEntity: requirement.entity,
          tableName: table.name,
          verified: true,
        });
      }
      findings.push(requirementFinding(requirement, table?.name ?? null, status, confidence));

      if (!table) continue;
      for (const field of requirement.fields) {
        fieldTotal += 1;
        const column = table.columns.find((candidate) => normalized(candidate.name) === normalized(field.name));
        if (column) {
          fieldPoints += 1;
          fieldMappings.push({
            confidenceScore: 1,
            columnName: column.name,
            matchType: 'EXACT_NAME',
            requirementId: requirement.id,
            specField: field.name,
            tableName: table.name,
            verified: true,
          });
        } else {
          findings.push({
            columnName: field.name,
            confidenceScore: 1,
            description: `The ${table.name} table does not contain the required ${field.name} field.`,
            evidence: { table: table.name },
            findingType: DatabaseSpecFindingType.MissingInDatabase,
            recommendation: 'Add or map a verified equivalent field.',
            relationshipName: null,
            requirementId: requirement.id,
            severity: severityFor(requirement.importance),
            tableName: table.name,
            title: `Missing field: ${field.name}`,
          });
        }
        if (field.unique) {
          constraintTotal += 1;
          const unique = column !== undefined && table.uniqueConstraints.some((columns) => columns.length === 1 && columns[0] === column.name);
          if (unique) constraintPoints += 1;
          if (!unique) {
            findings.push({
              columnName: field.name,
              confidenceScore: 1,
              description: `The specification requires ${field.name} to be unique, but ${table.name} has no verified single-column unique constraint for it.`,
              evidence: { table: table.name, uniqueConstraints: table.uniqueConstraints },
              findingType: DatabaseSpecFindingType.MissingUniqueConstraint,
              recommendation: 'Verify or add a unique constraint.',
              relationshipName: null,
              requirementId: requirement.id,
              severity: severityFor(requirement.importance),
              tableName: table.name,
              title: `Missing unique constraint: ${field.name}`,
            });
          }
        }
      }
    }

    for (const requirement of extraction.requirements) {
      const source = entityMappings.find((mapping) => mapping.requirementId === requirement.id);
      if (!source) continue;
      for (const relationship of requirement.relationships) {
        relationshipTotal += 1;
        const target = entityMappings.find((mapping) => normalized(mapping.specEntity) === normalized(relationship.toEntity));
        const sourceTable = tableByName.get(source.tableName);
        const targetTableName = target?.tableName;
        const verified = targetTableName !== undefined && sourceTable?.foreignKeys.some((key) => key.referencedTableName === targetTableName) === true;
        const relationshipName = `${relationship.fromEntity} → ${relationship.toEntity}`;
        if (verified) {
          relationshipPoints += 1;
          relationshipMappings.push({
            confidenceScore: 1,
            matchType: 'FOREIGN_KEY',
            relationshipName,
            requirementId: requirement.id,
            sourceTableName: source.tableName,
            targetTableName,
            verified: true,
          });
        } else {
          findings.push({
            columnName: null,
            confidenceScore: target ? 1 : 0.5,
            description: `No verified foreign key supports the required ${relationshipName} relationship.`,
            evidence: { sourceTable: source.tableName, targetTable: targetTableName ?? null },
            findingType: DatabaseSpecFindingType.MissingForeignKey,
            recommendation: 'Verify the relationship or add a foreign key.',
            relationshipName,
            requirementId: requirement.id,
            severity: severityFor(requirement.importance),
            tableName: source.tableName,
            title: `Missing foreign key: ${relationshipName}`,
          });
        }
      }
    }

    const mappedTables = new Set(entityMappings.map((mapping) => mapping.tableName));
    for (const table of snapshot.tables.filter((candidate) => !mappedTables.has(candidate.name))) {
      findings.push({
        columnName: null,
        confidenceScore: 1,
        description: `The ${table.name} table is present in the selected database but is not mentioned by the extracted specification requirements.`,
        evidence: { columns: table.columns.map((column) => column.name), table: table.name },
        findingType: DatabaseSpecFindingType.NotMentionedInSpec,
        recommendation: null,
        relationshipName: null,
        requirementId: null,
        severity: DatabaseSpecFindingSeverity.Info,
        tableName: table.name,
        title: `Not mentioned in specification: ${table.name}`,
      });
    }

    const entityScore = percent(entityPoints, entityTotal);
    const fieldScore = percent(fieldPoints, fieldTotal);
    const relationshipScore = percent(relationshipPoints, relationshipTotal);
    const constraintScore = percent(constraintPoints, constraintTotal);
    const semanticScore = entityScore;
    const anchorScore = percent(anchorPoints, anchorTotal);
    const overallScore = Math.round(
      entityScore * 0.35 + fieldScore * 0.2 + relationshipScore * 0.15 + constraintScore * 0.15 + semanticScore * 0.1 + anchorScore * 0.05,
    );
    const status = compatibilityStatus(extraction, entityPoints, anchorScore, overallScore);
    const knowledgeEligibility = eligibilityFor(status);
    const reason = reasonFor(status, extraction.extractionConfidence, anchorScore);
    const summary = summaryFor(findings);

    return {
      anchorScore,
      constraintScore,
      entityMappings,
      entityScore,
      expectedModel,
      extractionConfidence: extraction.extractionConfidence,
      fieldMappings,
      fieldScore,
      findings,
      knowledgeEligibility,
      overallScore,
      reason,
      relationshipMappings,
      relationshipScore,
      requirements: extraction.requirements,
      semanticScore,
      snapshot,
      status,
      summary,
    };
  }

  private matchedTable(
    requirement: ExtractedRequirement,
    semantic: z.infer<typeof semanticMatchSchema>['matches'][number] | undefined,
    tables: readonly SchemaTable[],
    tableByName: ReadonlyMap<string, SchemaTable>,
  ): SchemaTable | undefined {
    if (semantic?.tableName) {
      const table = tableByName.get(semantic.tableName);
      if (table && semantic.status !== 'MISSING') return table;
    }
    return tables.find((table) => normalized(table.name) === normalized(requirement.entity));
  }
}

function mergeExtractions(
  extractions: readonly z.infer<typeof extractionSchema>[],
): z.infer<typeof extractionSchema> {
  const byEntity = new Map<string, ExtractedRequirement>();
  for (const requirement of extractions.flatMap((extraction) => extraction.requirements)) {
    if (isGenericRequirement(requirement)) continue;

    const key = normalized(requirement.entity);
    const existing = byEntity.get(key);
    if (!existing) {
      byEntity.set(key, requirement);
      continue;
    }

    byEntity.set(key, {
      ...existing,
      fields: mergeFields(existing.fields, requirement.fields),
      importance: Math.max(existing.importance, requirement.importance),
      relationships: mergeRelationships(existing.relationships, requirement.relationships),
    });
  }

  const usedIds = new Map<string, number>();
  const requirements = [...byEntity.values()]
    .sort((left, right) => right.importance - left.importance)
    .slice(0, 20)
    .map((requirement) => {
      const count = usedIds.get(requirement.id) ?? 0;
      usedIds.set(requirement.id, count + 1);
      if (count === 0) return requirement;
      return { ...requirement, id: `${requirement.id.slice(0, 124)}-${String(count + 1)}` };
    });

  return {
    extractionConfidence:
      extractions.reduce((total, extraction) => total + extraction.extractionConfidence, 0) /
      extractions.length,
    isDatabaseRelevant: requirements.length > 0 && extractions.some((extraction) => extraction.isDatabaseRelevant),
    requirements,
  };
}

function semanticCandidates(
  chunks: ReturnType<typeof specificationExtractionChunkCandidates>,
): ReturnType<typeof specificationExtractionChunkCandidates> {
  if (chunks.length <= MAX_SEMANTIC_RETRIEVAL_CANDIDATES) return chunks;
  const [firstChunk, ...remainingChunks] = chunks;
  if (!firstChunk) return [];

  const selected = new Map([[firstChunk.index, firstChunk]]);
  for (const chunk of remainingChunks
    .slice()
    .sort((left, right) => right.lexicalScore - left.lexicalScore || left.index - right.index)
    .slice(0, 24)) {
    selected.set(chunk.index, chunk);
  }
  const interval = Math.max(1, Math.floor(remainingChunks.length / 24));
  for (let index = 0; index < remainingChunks.length && selected.size < MAX_SEMANTIC_RETRIEVAL_CANDIDATES; index += interval) {
    const chunk = remainingChunks[index];
    if (chunk) selected.set(chunk.index, chunk);
  }
  return [...selected.values()].sort((left, right) => left.index - right.index);
}

function schemaEmbeddingText(table: SchemaTable): string {
  return `${table.name}: ${table.columns.map((column) => `${column.name} ${column.type}`).join(', ')}`;
}

function maxCosineSimilarity(
  vector: number[] | undefined,
  candidates: readonly number[][],
): number {
  if (!vector) return -1;
  return Math.max(...candidates.map((candidate) => cosineSimilarity(vector, candidate)));
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return -1;
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined || rightValue === undefined) return -1;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  return leftMagnitude === 0 || rightMagnitude === 0
    ? -1
    : dotProduct / Math.sqrt(leftMagnitude * rightMagnitude);
}

const GENERIC_REQUIREMENT_ENTITIES = new Set([
  'decimalcolumn',
  'decimalcolumns',
  'file',
  'files',
  'module',
  'modules',
  'primarykey',
  'primarykeys',
  'softdelete',
  'timestamp',
  'timestamps',
]);

function isGenericRequirement(requirement: ExtractedRequirement): boolean {
  return GENERIC_REQUIREMENT_ENTITIES.has(normalized(requirement.entity));
}

function mergeFields(
  left: ExtractedRequirement['fields'],
  right: ExtractedRequirement['fields'],
): ExtractedRequirement['fields'] {
  const fields = new Map(left.map((field) => [normalized(field.name), field]));
  for (const field of right) {
    const existing = fields.get(normalized(field.name));
    fields.set(normalized(field.name), existing
      ? { ...existing, required: existing.required || field.required, unique: existing.unique || field.unique }
      : field);
  }
  return [...fields.values()];
}

function mergeRelationships(
  left: ExtractedRequirement['relationships'],
  right: ExtractedRequirement['relationships'],
): ExtractedRequirement['relationships'] {
  return [...new Map([...left, ...right].map((relationship) => [`${normalized(relationship.fromEntity)}:${normalized(relationship.toEntity)}`, relationship])).values()];
}

function systemMessage(content: string): { role: 'system'; content: string } {
  return { content, role: 'system' };
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
}

function candidateTables(tables: readonly SchemaTable[], requirements: readonly ExtractedRequirement[]): SchemaTable[] {
  const terms = requirements.flatMap((requirement) => [normalized(requirement.entity), ...requirement.fields.map((field) => normalized(field.name))]);
  const matching = tables.filter((table) => terms.some((term) => normalized(table.name).includes(term) || term.includes(normalized(table.name))));
  return (matching.length > 0 ? matching : tables).slice(0, 30);
}

function percent(points: number, total: number): number {
  return total === 0 ? 100 : Math.round((points / total) * 100);
}

function severityFor(importance: number): DatabaseSpecFindingSeverity {
  if (importance >= 90) return DatabaseSpecFindingSeverity.Critical;
  if (importance >= 70) return DatabaseSpecFindingSeverity.High;
  if (importance >= 40) return DatabaseSpecFindingSeverity.Medium;
  return DatabaseSpecFindingSeverity.Low;
}

function requirementFinding(
  requirement: ExtractedRequirement,
  tableName: string | null,
  status: 'MATCHED' | 'PARTIAL' | 'MISSING',
  confidenceScore: number,
): CompatibilityFindingDraft {
  const findingType = status === 'MATCHED' ? DatabaseSpecFindingType.Matched : status === 'PARTIAL' ? DatabaseSpecFindingType.PartiallyMatched : DatabaseSpecFindingType.MissingInDatabase;
  return {
    columnName: null,
    confidenceScore,
    description: tableName ? `Requirement ${requirement.entity} maps to ${tableName}.` : `No database table matched the ${requirement.entity} requirement.`,
    evidence: { entity: requirement.entity, table: tableName },
    findingType,
    recommendation: tableName ? null : 'Add or map a verified table for this requirement.',
    relationshipName: null,
    requirementId: requirement.id,
    severity: status === 'MATCHED' ? DatabaseSpecFindingSeverity.Info : severityFor(requirement.importance),
    tableName,
    title: `${status === 'MISSING' ? 'Missing' : status === 'PARTIAL' ? 'Partial' : 'Matched'} requirement: ${requirement.entity}`,
  };
}

function compatibilityStatus(
  extraction: z.infer<typeof extractionSchema>,
  entityPoints: number,
  anchorScore: number,
  score: number,
): CompatibilityStatus {
  if (!extraction.isDatabaseRelevant || extraction.requirements.length === 0) return CompatibilityStatus.NotRelevant;
  if (extraction.extractionConfidence < 0.5) return CompatibilityStatus.NeedsReview;
  if (entityPoints === 0 || anchorScore < 40) return CompatibilityStatus.Mismatch;
  if (score >= 85) return CompatibilityStatus.StrongMatch;
  if (score >= 70) return CompatibilityStatus.Matched;
  if (score >= 50) return CompatibilityStatus.PartiallyMatched;
  return CompatibilityStatus.Mismatch;
}

function eligibilityFor(status: CompatibilityStatus): KnowledgeEligibilityStatus {
  if (status === CompatibilityStatus.StrongMatch || status === CompatibilityStatus.Matched) return KnowledgeEligibilityStatus.Eligible;
  if (status === CompatibilityStatus.PartiallyMatched || status === CompatibilityStatus.NeedsReview) return KnowledgeEligibilityStatus.PendingReview;
  return KnowledgeEligibilityStatus.NotEligible;
}

function reasonFor(status: CompatibilityStatus, extractionConfidence: number, anchorScore: number): string {
  if (status === CompatibilityStatus.NotRelevant) return 'The specification contains no assessable database requirements.';
  if (status === CompatibilityStatus.NeedsReview) return `Requirement extraction confidence (${extractionConfidence.toFixed(2)}) is below the review threshold.`;
  if (status === CompatibilityStatus.Mismatch && anchorScore < 40) return 'Important requirement coverage is below the minimum anchor threshold.';
  return 'Compatibility status is derived from verified metadata checks and bounded semantic matching.';
}

function summaryFor(findings: readonly CompatibilityFindingDraft[]): Record<string, number> {
  const count = (type: DatabaseSpecFindingType) => findings.filter((finding) => finding.findingType === type).length;
  return {
    conflictingCount: count(DatabaseSpecFindingType.Conflicting),
    matchedCount: count(DatabaseSpecFindingType.Matched),
    missingInDatabaseCount: count(DatabaseSpecFindingType.MissingInDatabase),
    needsReviewCount: count(DatabaseSpecFindingType.NeedsReview),
    notMentionedInSpecCount: count(DatabaseSpecFindingType.NotMentionedInSpec),
    partiallyMatchedCount: count(DatabaseSpecFindingType.PartiallyMatched),
  };
}
