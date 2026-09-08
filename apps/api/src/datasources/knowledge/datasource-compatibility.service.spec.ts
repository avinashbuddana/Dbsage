import { DatasourceCompatibilityService } from './datasource-compatibility.service';
import {
  CompatibilityStatus,
  DatabaseSpecFindingType,
  KnowledgeEligibilityStatus,
} from './datasource-knowledge.enums';

const snapshot = {
  databaseName: 'commerce',
  tables: [
    {
      columns: [
        { name: 'id', nullable: false, type: 'bigint' },
        { name: 'reference', nullable: false, type: 'varchar(32)' },
        { name: 'order_id', nullable: false, type: 'bigint' },
      ],
      foreignKeys: [
        {
          columnName: 'order_id',
          constraintName: 'fk_payment_order',
          referencedColumnName: 'id',
          referencedTableName: 'orders',
        },
      ],
      name: 'payment_transactions',
      primaryKey: ['id'],
      type: 'BASE TABLE',
      uniqueConstraints: [['reference']],
    },
    {
      columns: [{ name: 'id', nullable: false, type: 'bigint' }],
      foreignKeys: [],
      name: 'orders',
      primaryKey: ['id'],
      type: 'BASE TABLE',
      uniqueConstraints: [],
    },
  ],
  truncated: false,
};

interface StructuredLlmCall {
  schemaName: string;
  messages: [{ content: string }, { content: string }];
}

function setup() {
  const analysis = { captureSchemaSnapshot: jest.fn().mockResolvedValue(snapshot) };
  const embeddings = { embed: jest.fn() };
  const llm = { generateStructured: jest.fn() };
  const logger = { info: jest.fn(), warn: jest.fn() };
  return {
    analysis,
    embeddings,
    llm,
    logger,
    service: new DatasourceCompatibilityService(
      analysis as never,
      llm as never,
      embeddings as never,
      logger as never,
    ),
  };
}

describe('DatasourceCompatibilityService', () => {
  it('creates verified matches and keeps knowledge eligible only after metadata checks', async () => {
    const { llm, service } = setup();
    llm.generateStructured
      .mockResolvedValueOnce({
        data: {
          extractionConfidence: 0.95,
          isDatabaseRelevant: true,
          requirements: [
            {
              description: 'A payment transaction has a unique reference and belongs to an order.',
              entity: 'PaymentTransaction',
              fields: [
                { name: 'reference', required: true, unique: true },
                { name: 'order_id', required: true, unique: false },
              ],
              id: 'payment',
              importance: 90,
              relationships: [{ fromEntity: 'PaymentTransaction', toEntity: 'Order' }],
            },
            {
              description: 'Orders have an identifier.',
              entity: 'Order',
              fields: [{ name: 'id', required: true, unique: false }],
              id: 'order',
              importance: 80,
              relationships: [],
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { entities: [{ fields: ['reference', 'order_id'], name: 'PaymentTransaction' }] } })
      .mockResolvedValueOnce({
        data: {
          matches: [
            { confidence: 0.98, requirementId: 'payment', status: 'MATCHED', tableName: 'payment_transactions' },
            { confidence: 0.98, requirementId: 'order', status: 'MATCHED', tableName: 'orders' },
          ],
        },
      });

    const result = await service.analyze('organization-id', 'datasource-id', 'commerce', '# Payments');

    expect(result).toMatchObject({
      knowledgeEligibility: KnowledgeEligibilityStatus.Eligible,
      overallScore: 100,
      status: CompatibilityStatus.StrongMatch,
    });
    expect(result.relationshipMappings).toEqual([
      expect.objectContaining({ sourceTableName: 'payment_transactions', targetTableName: 'orders', verified: true }),
    ]);
    expect(result.findings).toContainEqual(expect.objectContaining({ findingType: DatabaseSpecFindingType.Matched }));
    expect(result.findings).not.toContainEqual(expect.objectContaining({ findingType: DatabaseSpecFindingType.MissingUniqueConstraint }));
  });

  it('blocks knowledge for an unrelated specification and still reports database-only tables', async () => {
    const { llm, service } = setup();
    llm.generateStructured
      .mockResolvedValueOnce({
        data: {
          extractionConfidence: 0.98,
          isDatabaseRelevant: true,
          requirements: [
            {
              description: 'A hospital keeps patient diagnoses.',
              entity: 'PatientDiagnosis',
              fields: [{ name: 'diagnosis', required: true, unique: false }],
              id: 'diagnosis',
              importance: 95,
              relationships: [],
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { entities: [{ fields: ['diagnosis'], name: 'PatientDiagnosis' }] } })
      .mockResolvedValueOnce({ data: { matches: [{ confidence: 0.9, requirementId: 'diagnosis', status: 'MISSING', tableName: null }] } });

    const result = await service.analyze('organization-id', 'datasource-id', 'commerce', '# Hospital');

    expect(result).toMatchObject({
      knowledgeEligibility: KnowledgeEligibilityStatus.NotEligible,
      status: CompatibilityStatus.Mismatch,
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({ findingType: DatabaseSpecFindingType.NotMentionedInSpec, tableName: 'payment_transactions' }),
    );
  });

  it('extracts a large specification in bounded Markdown chunks', async () => {
    const { llm, service } = setup();
    const paymentRequirement = {
      description: 'A payment transaction has a unique reference.',
      entity: 'PaymentTransaction',
      fields: [{ name: 'reference', required: true, unique: true }],
      id: 'payment',
      importance: 90,
      relationships: [],
    };
    const orderRequirement = {
      description: 'An order has an identifier.',
      entity: 'Order',
      fields: [{ name: 'id', required: true, unique: false }],
      id: 'order',
      importance: 80,
      relationships: [],
    };
    llm.generateStructured
      .mockResolvedValueOnce({ data: { extractionConfidence: 0.9, isDatabaseRelevant: true, requirements: [paymentRequirement] } })
      .mockResolvedValueOnce({ data: { extractionConfidence: 0.8, isDatabaseRelevant: true, requirements: [orderRequirement] } })
      .mockResolvedValueOnce({ data: { entities: [{ fields: ['reference'], name: 'PaymentTransaction' }, { fields: ['id'], name: 'Order' }] } })
      .mockResolvedValueOnce({ data: { matches: [{ confidence: 0.9, requirementId: 'payment', status: 'MATCHED', tableName: 'payment_transactions' }, { confidence: 0.9, requirementId: 'order', status: 'MATCHED', tableName: 'orders' }] } });

    await service.analyze('organization-id', 'datasource-id', 'commerce', '# Payments\nPayment transactions need a unique reference.\n'.repeat(40));

    const extractionCalls = (llm.generateStructured.mock.calls as unknown as [StructuredLlmCall][]).filter(
      ([request]) => request.schemaName === 'specification_requirement_extraction_chunk',
    );
    expect(extractionCalls).toHaveLength(2);
    expect(extractionCalls.every(([request]) => request.messages[1].content.length <= 1_500)).toBe(true);
  });

  it('merges repeated entities and ignores generic code conventions across chunks', async () => {
    const { llm, service } = setup();
    llm.generateStructured
      .mockResolvedValueOnce({
        data: {
          extractionConfidence: 0.9,
          isDatabaseRelevant: true,
          requirements: [
            { description: 'Payments have unique references.', entity: 'PaymentTransaction', fields: [{ name: 'reference', required: true, unique: true }], id: 'payment-reference', importance: 90, relationships: [] },
            { description: 'Primary keys use an integer.', entity: 'Primary keys', fields: [{ name: 'id', required: true, unique: true }], id: 'primary-key', importance: 90, relationships: [] },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          extractionConfidence: 0.9,
          isDatabaseRelevant: true,
          requirements: [
            { description: 'Payments belong to orders.', entity: 'PaymentTransaction', fields: [{ name: 'order_id', required: true, unique: false }], id: 'payment-order', importance: 80, relationships: [{ fromEntity: 'PaymentTransaction', toEntity: 'Order' }] },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { entities: [{ fields: ['reference', 'order_id'], name: 'PaymentTransaction' }] } })
      .mockResolvedValueOnce({ data: { matches: [{ confidence: 0.9, requirementId: 'payment-reference', status: 'MATCHED', tableName: 'payment_transactions' }] } });

    const result = await service.analyze('organization-id', 'datasource-id', 'commerce', '# Payments\nPayment transactions need references and orders.\n'.repeat(40));

    const [payment] = result.requirements;
    expect(result.requirements).toHaveLength(1);
    expect(payment?.entity).toBe('PaymentTransaction');
    expect(payment?.fields.some((field) => field.name === 'reference')).toBe(true);
    expect(payment?.fields.some((field) => field.name === 'order_id')).toBe(true);
  });

  it('uses local embeddings to select relevant chunks from a large specification', async () => {
    const { embeddings, llm, service } = setup();
    embeddings.embed.mockImplementation((inputs: readonly string[]) =>
      Promise.resolve(inputs.map((_, index) => (index < snapshot.tables.length ? [1, 0] : [0, 1]))),
    );
    llm.generateStructured.mockImplementation((request: unknown) => {
      const schemaName = (request as { schemaName: string }).schemaName;
      if (schemaName === 'specification_requirement_extraction_chunk') {
        return Promise.resolve({
          data: {
            extractionConfidence: 0.9,
            isDatabaseRelevant: true,
            requirements: [
              {
                description: 'A payment transaction has a unique reference.',
                entity: 'PaymentTransaction',
                fields: [{ name: 'reference', required: true, unique: true }],
                id: 'payment',
                importance: 90,
                relationships: [],
              },
            ],
          },
        });
      }
      if (schemaName === 'specification_expected_model') {
        return Promise.resolve({ data: { entities: [{ fields: ['reference'], name: 'PaymentTransaction' }] } });
      }
      return Promise.resolve({ data: { matches: [{ confidence: 0.9, requirementId: 'payment', status: 'MATCHED', tableName: 'payment_transactions' }] } });
    });

    await service.analyze(
      'organization-id',
      'datasource-id',
      'commerce',
      '# Payments\nPayment transactions need a unique reference.\n'.repeat(400),
    );

    expect(embeddings.embed).toHaveBeenCalledTimes(1);
  });
});
