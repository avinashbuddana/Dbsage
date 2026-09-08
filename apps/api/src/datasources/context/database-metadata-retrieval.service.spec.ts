import { DatabaseContextPurpose } from '@schemaiq/types';

import { DatabaseContextRequestAnalyzer } from './database-context-request-analyzer.service';
import { DatabaseMetadataRetrievalService } from './database-metadata-retrieval.service';

describe('DatabaseMetadataRetrievalService', () => {
  it('matches camel-case singular requests to snake-case plural schema metadata', () => {
    const service = new DatabaseMetadataRetrievalService({ findOne: jest.fn() } as never);
    const request = new DatabaseContextRequestAnalyzer().analyze({
      purpose: DatabaseContextPurpose.SchemaQuestion,
      query: 'How does OrderItem relate to order_id?',
    });

    const [candidate] = service.retrieve(
      {
        entity: { id: 'snapshot-id' } as never,
        schema: {
          databaseName: 'commerce',
          tables: [
            {
              columns: [{ name: 'order_id', nullable: false, type: 'bigint' }],
              foreignKeys: [],
              name: 'order_items',
              primaryKey: ['id'],
              type: 'BASE TABLE',
              uniqueConstraints: [],
            },
          ],
          truncated: false,
        },
      },
      request,
      8,
    );

    expect(candidate).toMatchObject({ exactMatch: true, tableName: 'order_items' });
  });
});
