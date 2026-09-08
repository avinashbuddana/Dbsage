export interface HealthResponse {
  status: 'ok';
  service: 'schemaiq-api';
}

export interface ReadinessResponse extends HealthResponse {
  checks: {
    postgres: 'up';
    redis: 'up';
  };
}

export enum DataImportStatus {
  Uploaded = 'UPLOADED',
  Validating = 'VALIDATING',
  Queued = 'QUEUED',
  Processing = 'PROCESSING',
  Completed = 'COMPLETED',
  PartiallyCompleted = 'PARTIALLY_COMPLETED',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
}

export enum DataImportProcessingMode {
  Synchronous = 'SYNCHRONOUS',
  Queued = 'QUEUED',
}

export enum DataImportMode {
  Strict = 'STRICT',
  Flexible = 'FLEXIBLE',
}

export enum DataImportErrorCode {
  CsvFileTooLarge = 'CSV_FILE_TOO_LARGE',
  CsvHeaderInvalid = 'CSV_HEADER_INVALID',
  CsvInvalidFormat = 'CSV_INVALID_FORMAT',
  CsvColumnMappingInvalid = 'CSV_COLUMN_MAPPING_INVALID',
  ImportCopyFailed = 'IMPORT_COPY_FAILED',
  ImportFileNotFound = 'IMPORT_FILE_NOT_FOUND',
  ImportPostgresTypeError = 'IMPORT_POSTGRES_TYPE_ERROR',
  ImportConstraintViolation = 'IMPORT_CONSTRAINT_VIOLATION',
  ImportDuplicateValue = 'IMPORT_DUPLICATE_VALUE',
  ImportForeignKeyViolation = 'IMPORT_FOREIGN_KEY_VIOLATION',
  ImportTargetNotAllowed = 'IMPORT_TARGET_NOT_ALLOWED',
  ImportTimeout = 'IMPORT_TIMEOUT',
  ImportInternalError = 'IMPORT_INTERNAL_ERROR',
  ImportValidationFailed = 'IMPORT_VALIDATION_FAILED',
}

export interface DataImportApiResponse {
  id: string;
  originalFileName: string;
  fileSizeBytes: string;
  mimeType: string;
  targetSchema: string;
  targetTable: string;
  status: DataImportStatus;
  processingMode: DataImportProcessingMode;
  importMode: DataImportMode;
  delimiter: string;
  hasHeader: boolean;
  totalRows: string | null;
  processedRows: string;
  successfulRows: string;
  failedRows: string;
  processedBytes: string;
  progressPercent: number;
  errorCode: DataImportErrorCode | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DataImportRowErrorResponse {
  row: number;
  csvColumn: string;
  databaseColumn: string;
  value: string;
  targetType: string;
  error: string;
}

export interface PaginatedDataImportsResponse {
  items: DataImportApiResponse[];
  total: number;
}

export interface DataImportSummaryResponse {
  totalImports: string;
  completedImports: string;
  processingImports: string;
  failedImports: string;
  totalRowsImported: string;
}

export interface ImportClientConfigurationResponse {
  maxFileSizeBytes: number;
  queueThresholdBytes: number;
  maxColumns: number;
  maxHeaderLength: number;
  allowedDelimiters: string[];
}

export interface ImportTargetSchemaResponse {
  name: string;
}

export interface ImportTargetTableResponse {
  name: string;
  columnCount: number;
}

export interface ImportTargetColumnResponse {
  name: string;
  dataType: string;
  isNullable: boolean;
  hasDefault: boolean;
  isGenerated: boolean;
  isIdentity: boolean;
}

export interface ImportTargetDetailsResponse {
  schema: string;
  table: string;
  columns: ImportTargetColumnResponse[];
}

export enum DatasourceType {
  MySql = 'MYSQL',
}

export enum DatasourceConnectionMode {
  Direct = 'DIRECT',
  SshTunnel = 'SSH_TUNNEL',
}

export enum DatasourceStatus {
  Active = 'ACTIVE',
  ConnectionFailed = 'CONNECTION_FAILED',
  Disabled = 'DISABLED',
}

export interface DatasourceResponse {
  id: string;
  organizationId: string;
  name: string;
  databaseType: DatasourceType;
  connectionMode: DatasourceConnectionMode;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  sslEnabled: boolean;
  status: DatasourceStatus;
  lastConnectedAt: string | null;
  lastConnectionErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionTestResult {
  success: true;
  latencyMs: number;
  databaseType: DatasourceType;
}

export interface DatasourceDatabaseResponse {
  name: string;
}

export interface DatasourceSpecChatMessage {
  role: 'assistant' | 'user';
  content: string;
}

export interface DatasourceSpecChatInput {
  databaseName: string;
  specification: string;
  messages: DatasourceSpecChatMessage[];
}

export interface DatasourceSpecChatResponse {
  databaseName: string;
  content: string;
}

export enum DatasourceSpecAnalysisStatus {
  Queued = 'QUEUED',
  Processing = 'PROCESSING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}

export interface DatasourceSpecAnalysisInput {
  databaseName: string;
  specification: string;
}

export type DatasourceSpecRequirementStatus = 'MATCHED' | 'PARTIAL' | 'MISSING';

export interface DatasourceSpecAnalysisRequirement {
  requirement: string;
  status: DatasourceSpecRequirementStatus;
  evidence: string;
}

export interface DatasourceSpecAnalysisReport {
  summary: string;
  requirements: DatasourceSpecAnalysisRequirement[];
  assumptions: string[];
}

export interface DatasourceSpecAnalysisResponse {
  id: string;
  datasourceId: string;
  databaseName: string;
  status: DatasourceSpecAnalysisStatus;
  result: string | null;
  matchScore: number | null;
  specificationId: string | null;
  specificationVersionId: string | null;
  schemaSnapshotId: string | null;
  compatibilityCheckId: string | null;
  report: DatasourceSpecAnalysisReport | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export enum CompatibilityStatus {
  StrongMatch = 'STRONG_MATCH',
  Matched = 'MATCHED',
  PartiallyMatched = 'PARTIALLY_MATCHED',
  Mismatch = 'MISMATCH',
  NeedsReview = 'NEEDS_REVIEW',
  NotRelevant = 'NOT_RELEVANT',
}

export enum KnowledgeEligibilityStatus {
  Eligible = 'ELIGIBLE',
  PendingReview = 'PENDING_REVIEW',
  NotEligible = 'NOT_ELIGIBLE',
}

export enum DatabaseSpecFindingType {
  Matched = 'MATCHED',
  PartiallyMatched = 'PARTIALLY_MATCHED',
  MissingInDatabase = 'MISSING_IN_DATABASE',
  NotMentionedInSpec = 'NOT_MENTIONED_IN_SPEC',
  Conflicting = 'CONFLICTING',
  TypeMismatch = 'TYPE_MISMATCH',
  NullabilityMismatch = 'NULLABILITY_MISMATCH',
  MissingPrimaryKey = 'MISSING_PRIMARY_KEY',
  MissingForeignKey = 'MISSING_FOREIGN_KEY',
  MissingUniqueConstraint = 'MISSING_UNIQUE_CONSTRAINT',
  MissingIndex = 'MISSING_INDEX',
  UnexpectedRelationship = 'UNEXPECTED_RELATIONSHIP',
  UnknownTablePurpose = 'UNKNOWN_TABLE_PURPOSE',
  NeedsReview = 'NEEDS_REVIEW',
}

export enum DatabaseSpecFindingSeverity {
  Critical = 'CRITICAL',
  High = 'HIGH',
  Medium = 'MEDIUM',
  Low = 'LOW',
  Info = 'INFO',
}

export enum DatabaseSpecFindingStatus {
  Open = 'OPEN',
  Acknowledged = 'ACKNOWLEDGED',
  Resolved = 'RESOLVED',
  FalsePositive = 'FALSE_POSITIVE',
  Ignored = 'IGNORED',
}

export enum DatasourceKnowledgeVersionStatus {
  Building = 'BUILDING',
  Ready = 'READY',
  Active = 'ACTIVE',
  Failed = 'FAILED',
  Superseded = 'SUPERSEDED',
}

export enum DatasourceKnowledgeStaleness {
  Current = 'CURRENT',
  SpecChanged = 'SPEC_CHANGED',
  SchemaChanged = 'SCHEMA_CHANGED',
  Rebuilding = 'REBUILDING',
  Failed = 'FAILED',
}

export enum DatabaseKnowledgeType {
  TableMeaning = 'TABLE_MEANING',
  ColumnMeaning = 'COLUMN_MEANING',
  EntityMapping = 'ENTITY_MAPPING',
  FieldMapping = 'FIELD_MAPPING',
  Relationship = 'RELATIONSHIP',
  BusinessRule = 'BUSINESS_RULE',
  Constraint = 'CONSTRAINT',
  SecurityRule = 'SECURITY_RULE',
  AuditRule = 'AUDIT_RULE',
  DataRetentionRule = 'DATA_RETENTION_RULE',
  DomainSummary = 'DOMAIN_SUMMARY',
  ArchitectureFact = 'ARCHITECTURE_FACT',
  UserConfirmedMapping = 'USER_CONFIRMED_MAPPING',
  SpecRequirement = 'SPEC_REQUIREMENT',
  UnmetRequirement = 'UNMET_REQUIREMENT',
}

export enum DatabaseKnowledgeSourceType {
  Specification = 'SPECIFICATION',
  DatabaseSchema = 'DATABASE_SCHEMA',
  HybridVerified = 'HYBRID_VERIFIED',
  UserConfirmed = 'USER_CONFIRMED',
  Generated = 'GENERATED',
}

export interface DatasourceCompatibilityResponse {
  id: string;
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
  matchedCount: number;
  partiallyMatchedCount: number;
  missingInDatabaseCount: number;
  notMentionedInSpecCount: number;
  conflictingCount: number;
  needsReviewCount: number;
  createdAt: string;
}

export interface DatasourceSpecificationFindingResponse {
  id: string;
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
  confidenceScore: string | number;
  status: DatabaseSpecFindingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedDatasourceSpecificationFindingsResponse {
  items: DatasourceSpecificationFindingResponse[];
  page: number;
  limit: number;
  total: number;
}

export interface DatasourceKnowledgeVersionResponse {
  id: string;
  specificationVersionId: string;
  schemaSnapshotId: string;
  compatibilityCheckId: string;
  versionNumber: number;
  status: DatasourceKnowledgeVersionStatus;
  knowledgeCount: number;
  chunkCount: number;
  createdAt: string;
  completedAt: string | null;
  activatedAt: string | null;
  supersededAt: string | null;
}

export interface DatasourceKnowledgeStatusResponse {
  activeKnowledgeVersion: string | null;
  specificationVersionId: string | null;
  schemaSnapshotId: string | null;
  status: DatasourceKnowledgeVersionStatus | null;
  knowledgeCount: number;
  chunkCount: number;
  staleness: DatasourceKnowledgeStaleness;
}

export enum DatabaseContextPurpose {
  SchemaQuestion = 'SCHEMA_QUESTION',
  DatabaseExplanation = 'DATABASE_EXPLANATION',
  CompatibilityInvestigation = 'COMPATIBILITY_INVESTIGATION',
  DocumentationGeneration = 'DOCUMENTATION_GENERATION',
  FutureSqlGeneration = 'FUTURE_SQL_GENERATION',
}

export enum DatabaseContextAuthority {
  ActualSchema = 'ACTUAL_SCHEMA',
  UserConfirmed = 'USER_CONFIRMED',
  HybridVerified = 'HYBRID_VERIFIED',
  VerifiedSpecification = 'VERIFIED_SPECIFICATION',
  DatabaseSemantic = 'DATABASE_SEMANTIC',
  LlmDerived = 'LLM_DERIVED',
  Inferred = 'INFERRED',
}

export enum DatabaseContextSource {
  SchemaSnapshot = 'SCHEMA_SNAPSHOT',
  Knowledge = 'KNOWLEDGE',
  VectorKnowledge = 'VECTOR_KNOWLEDGE',
  CompatibilityFinding = 'COMPATIBILITY_FINDING',
}

export type DatabaseContextItemKind =
  | 'TABLE'
  | 'COLUMN'
  | 'RELATIONSHIP'
  | 'CONSTRAINT'
  | 'KNOWLEDGE'
  | 'FINDING';

export interface DatabaseContextColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface DatabaseContextTable {
  name: string;
  type: string;
  columns: DatabaseContextColumn[];
  primaryKey: string[];
  uniqueConstraints: string[][];
}

export interface DatabaseContextRelationship {
  name: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  constraintName: string;
}

export interface DatabaseContextItem {
  id: string;
  kind: DatabaseContextItemKind;
  source: DatabaseContextSource;
  authority: DatabaseContextAuthority;
  confidence: number;
  score: number;
  verified: boolean;
  exactMatch: boolean;
  tableName: string | null;
  columnName: string | null;
  relationshipName: string | null;
  content: string | null;
}

export interface DatabaseContextPackage {
  datasourceId: string;
  query: string;
  purpose: DatabaseContextPurpose;
  schemaSnapshotId: string;
  knowledgeVersionId: string | null;
  staleness: DatasourceKnowledgeStaleness;
  tables: DatabaseContextTable[];
  relationships: DatabaseContextRelationship[];
  items: DatabaseContextItem[];
  estimatedTokens: number;
  truncated: boolean;
  omittedSources: DatabaseContextSource[];
}

export interface DatabaseContextOverviewResponse {
  datasourceId: string;
  schemaSnapshotId: string;
  knowledgeVersionId: string | null;
  staleness: DatasourceKnowledgeStaleness;
  tableCount: number;
  relationshipCount: number;
  truncatedSchema: boolean;
}

export interface DatabaseRootEntityResponse {
  tableName: string;
  score: number;
  inboundRelationshipCount: number;
  outboundRelationshipCount: number;
  primaryKey: string[];
}

export interface DatabaseAnalysisClaim {
  text: string;
  evidenceIds: string[];
}

export interface DatabaseAnalysisResponse {
  context: DatabaseContextPackage;
  answer: string;
  claims: DatabaseAnalysisClaim[];
  uncertainties: string[];
}

export enum DatabaseCopilotIntent {
  SchemaQuestion = 'SCHEMA_QUESTION',
  BusinessMeaning = 'BUSINESS_MEANING',
  RelationshipAnalysis = 'RELATIONSHIP_ANALYSIS',
  SpecCompliance = 'SPEC_COMPLIANCE',
  DatabaseOverview = 'DATABASE_OVERVIEW',
  DataQuery = 'DATA_QUERY',
  AggregationQuery = 'AGGREGATION_QUERY',
  SqlExplanation = 'SQL_EXPLANATION',
  QueryOptimization = 'QUERY_OPTIMIZATION',
  Documentation = 'DOCUMENTATION',
  UnsupportedMutation = 'UNSUPPORTED_MUTATION',
  Unknown = 'UNKNOWN',
}

export enum GeneratedQueryStatus {
  Generated = 'GENERATED',
  Validated = 'VALIDATED',
  Rejected = 'REJECTED',
  NeedsClarification = 'NEEDS_CLARIFICATION',
  Stale = 'STALE',
}

export enum SqlQueryOperation {
  Select = 'SELECT',
  Aggregate = 'AGGREGATE',
}

export enum SqlAggregate {
  Count = 'COUNT',
  CountDistinct = 'COUNT_DISTINCT',
  Sum = 'SUM',
  Avg = 'AVG',
  Min = 'MIN',
  Max = 'MAX',
}

export enum SqlFilterOperator {
  Eq = 'EQ',
  Neq = 'NEQ',
  Gt = 'GT',
  Gte = 'GTE',
  Lt = 'LT',
  Lte = 'LTE',
  In = 'IN',
  NotIn = 'NOT_IN',
  Between = 'BETWEEN',
  Like = 'LIKE',
  IsNull = 'IS_NULL',
  IsNotNull = 'IS_NOT_NULL',
}

export enum SqlJoinType {
  Inner = 'INNER',
  Left = 'LEFT',
}

export interface SqlQueryParameterMetadata {
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'DATETIME' | 'NULL';
}

export interface SqlGenerationSafety {
  readOnly: boolean;
  validated: boolean;
  defaultLimitApplied: boolean;
}

export interface SqlGenerationResult {
  id: string | null;
  status: GeneratedQueryStatus;
  supported: boolean;
  intent: DatabaseCopilotIntent;
  question: string;
  queryPlan: Record<string, unknown> | null;
  sql: string | null;
  parameters: SqlQueryParameterMetadata[];
  schemaSnapshotId: string | null;
  knowledgeVersionId: string | null;
  tables: string[];
  columns: string[];
  safety: SqlGenerationSafety;
  confidence: number;
  warnings: string[];
  reason: string | null;
  clarificationCandidates: string[];
}

export interface DatabaseCopilotAnalysisResponse {
  supported: true;
  intent: DatabaseCopilotIntent;
  confidence: number;
  analysis: DatabaseAnalysisResponse;
}

export type DatabaseCopilotResponse = SqlGenerationResult | DatabaseCopilotAnalysisResponse;
