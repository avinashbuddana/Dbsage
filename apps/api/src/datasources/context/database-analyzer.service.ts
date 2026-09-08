import { BadGatewayException, Injectable } from '@nestjs/common';
import type {
  DatabaseAnalysisResponse,
  DatabaseContextOverviewResponse,
  DatabaseRootEntityResponse,
} from '@schemaiq/types';
import { z } from 'zod';

import { LlmTask } from '../../llm/enums/llm-task.enum';
import { LlmService } from '../../llm/llm.service';
import type { DatabaseContextRequest } from './database-context.types';
import { DatabaseContextService } from './database-context.service';

const databaseAnalysisSchema = z.object({
  answer: z.string().min(1).max(1_800),
  claims: z
    .array(
      z.object({
        evidenceIds: z.array(z.string().min(1).max(160)).min(1).max(4),
        text: z.string().min(1).max(400),
      }),
    )
    .max(12),
  uncertainties: z.array(z.string().min(1).max(300)).max(8),
});

@Injectable()
export class DatabaseAnalyzerService {
  constructor(
    private readonly context: DatabaseContextService,
    private readonly llm: LlmService,
  ) {}

  async analyze(
    organizationId: string,
    datasourceId: string,
    request: DatabaseContextRequest,
  ): Promise<DatabaseAnalysisResponse> {
    const context = await this.context.build(organizationId, datasourceId, request);
    const result = await this.llm.generateStructured({
      datasourceId,
      messages: [
        {
          content:
            'Answer only from the supplied bounded database context package. Every claim must cite one or more item IDs from that package. Do not infer tables, columns, relationships, database rows, credentials, SQL, or actions that are not represented in the package. State uncertainty when evidence is missing.',
          role: 'system',
        },
        { content: JSON.stringify(context), role: 'user' },
      ],
      organizationId,
      schema: databaseAnalysisSchema,
      schemaName: 'database_context_analysis',
      task: LlmTask.DatabaseContextAnalysis,
    });
    const evidenceIds = new Set(context.items.map((item) => item.id));
    if (result.data.claims.some((claim) => claim.evidenceIds.some((id) => !evidenceIds.has(id)))) {
      throw new BadGatewayException('Database analysis returned unsupported evidence references');
    }
    return { ...result.data, context };
  }

  overview(organizationId: string, datasourceId: string): Promise<DatabaseContextOverviewResponse> {
    return this.context.overview(organizationId, datasourceId);
  }

  async rootEntities(organizationId: string, datasourceId: string): Promise<DatabaseRootEntityResponse[]> {
    const state = await this.context.getState(organizationId, datasourceId);
    const inboundCounts = new Map<string, number>();
    for (const table of state.snapshot.schema.tables) {
      for (const foreignKey of table.foreignKeys) {
        inboundCounts.set(
          foreignKey.referencedTableName,
          (inboundCounts.get(foreignKey.referencedTableName) ?? 0) + 1,
        );
      }
    }
    return state.snapshot.schema.tables
      .map((table) => {
        const inboundRelationshipCount = inboundCounts.get(table.name) ?? 0;
        const outboundRelationshipCount = table.foreignKeys.length;
        return {
          inboundRelationshipCount,
          outboundRelationshipCount,
          primaryKey: table.primaryKey,
          score: inboundRelationshipCount * 4 + outboundRelationshipCount * 2 + (table.primaryKey.length > 0 ? 1 : 0),
          tableName: table.name,
        };
      })
      .sort((left, right) => right.score - left.score || left.tableName.localeCompare(right.tableName));
  }
}
