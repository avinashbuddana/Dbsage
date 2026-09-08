import { BadGatewayException } from '@nestjs/common';
import { DatabaseContextPurpose, DatasourceKnowledgeStaleness } from '@schemaiq/types';

import { DatabaseAnalyzerService } from './database-analyzer.service';

const context = {
  datasourceId: 'datasource-id',
  estimatedTokens: 8,
  items: [
    {
      authority: 'ACTUAL_SCHEMA',
      columnName: null,
      confidence: 1,
      content: null,
      exactMatch: true,
      id: 'schema:table:orders',
      kind: 'TABLE',
      relationshipName: null,
      score: 1_000,
      source: 'SCHEMA_SNAPSHOT',
      tableName: 'orders',
      verified: true,
    },
  ],
  knowledgeVersionId: null,
  omittedSources: [],
  purpose: DatabaseContextPurpose.SchemaQuestion,
  query: 'Explain orders',
  relationships: [],
  schemaSnapshotId: 'snapshot-id',
  staleness: DatasourceKnowledgeStaleness.Current,
  tables: [],
  truncated: false,
};

describe('DatabaseAnalyzerService', () => {
  it('rejects LLM claims that do not cite a context item', async () => {
    const databaseContext = { build: jest.fn().mockResolvedValue(context) };
    const llm = {
      generateStructured: jest.fn().mockResolvedValue({
        data: { answer: 'Orders exist.', claims: [{ evidenceIds: ['invented'], text: 'Orders exist.' }], uncertainties: [] },
      }),
    };
    const service = new DatabaseAnalyzerService(databaseContext as never, llm as never);

    await expect(
      service.analyze('organization-id', 'datasource-id', {
        purpose: DatabaseContextPurpose.SchemaQuestion,
        query: 'Explain orders',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('derives root entities from foreign-key direction without calling the LLM', async () => {
    const databaseContext = {
      getState: jest.fn().mockResolvedValue({
        snapshot: {
          schema: {
            tables: [
              { foreignKeys: [], name: 'customers', primaryKey: ['id'] },
              {
                foreignKeys: [{ referencedTableName: 'customers' }],
                name: 'orders',
                primaryKey: ['id'],
              },
            ],
          },
        },
      }),
    };
    const llm = { generateStructured: jest.fn() };
    const service = new DatabaseAnalyzerService(databaseContext as never, llm as never);

    await expect(service.rootEntities('organization-id', 'datasource-id')).resolves.toEqual([
      expect.objectContaining({ inboundRelationshipCount: 1, tableName: 'customers' }),
      expect.objectContaining({ outboundRelationshipCount: 1, tableName: 'orders' }),
    ]);
    expect(llm.generateStructured).not.toHaveBeenCalled();
  });
});
