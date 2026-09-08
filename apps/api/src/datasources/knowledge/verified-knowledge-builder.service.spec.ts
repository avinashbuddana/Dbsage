import { VerifiedKnowledgeBuilderService } from './verified-knowledge-builder.service';
import { DatasourceKnowledgeVersionStatus, KnowledgeEligibilityStatus } from './datasource-knowledge.enums';
import { createHash } from 'node:crypto';

const ids = {
  check: '00000000-0000-4000-8000-000000000001',
  datasource: '00000000-0000-4000-8000-000000000002',
  knowledge: '00000000-0000-4000-8000-000000000003',
  mapping: '00000000-0000-4000-8000-000000000004',
  organization: '00000000-0000-4000-8000-000000000005',
  version: '00000000-0000-4000-8000-000000000006',
};

function repository() {
  return {
    create: jest.fn((value: unknown): unknown => value),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    save: jest.fn((value: unknown): Promise<unknown> => Promise.resolve(value)),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

function setup(eligible = true) {
  const versions = repository();
  const checks = repository();
  const entities = repository();
  const fields = repository();
  const relationships = repository();
  const findings = repository();
  const knowledge = repository();
  const chunks = repository();
  versions.findOne.mockResolvedValue({
    compatibilityCheckId: ids.check,
    datasourceId: ids.datasource,
    id: ids.version,
    organizationId: ids.organization,
    schemaSnapshotId: '00000000-0000-4000-8000-000000000007',
    specificationVersionId: '00000000-0000-4000-8000-000000000008',
    status: DatasourceKnowledgeVersionStatus.Building,
  });
  checks.findOne.mockResolvedValue({ knowledgeEligibility: eligible ? KnowledgeEligibilityStatus.Eligible : KnowledgeEligibilityStatus.NotEligible });
  entities.find.mockResolvedValue([
    {
      confidenceScore: 0.98,
      id: ids.mapping,
      specEntity: 'Payment',
      tableName: 'payment_transactions',
    },
  ]);
  knowledge.create.mockImplementation((value: unknown) => ({ ...(value as Record<string, unknown>), id: ids.knowledge }));
  const llm = {
    generateStructured: jest.fn().mockResolvedValue({
      data: { items: [{ content: 'payment_transactions represents the verified Payment concept.', sourceId: ids.mapping }] },
    }),
  };
  const embeddings = { dimensions: 3, embed: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]), model: 'nomic-embed-text' };
  const builder = new VerifiedKnowledgeBuilderService(
    versions as never,
    checks as never,
    entities as never,
    fields as never,
    relationships as never,
    findings as never,
    knowledge as never,
    chunks as never,
    llm as never,
    embeddings as never,
  );
  return { builder, chunks, embeddings, knowledge, versions };
}

describe('VerifiedKnowledgeBuilderService', () => {
  it('creates and activates embedded knowledge only for an eligible compatibility check', async () => {
    const { builder, chunks, embeddings, knowledge, versions } = setup();

    await builder.build(ids.organization, ids.datasource, ids.version);

    expect(embeddings.embed).toHaveBeenCalledWith(['payment_transactions represents the verified Payment concept.']);
    expect(knowledge.save).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ active: false, verified: true })]),
    );
    expect(chunks.save).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ embedding: '[0.1,0.2,0.3]', embeddingDimensions: 3 })]),
    );
    expect(versions.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: ids.version, status: DatasourceKnowledgeVersionStatus.Building }),
      expect.objectContaining({ status: DatasourceKnowledgeVersionStatus.Active }),
    );
  });

  it('creates no chunks for a mismatch', async () => {
    const { builder, chunks, embeddings, knowledge, versions } = setup(false);

    await expect(builder.build(ids.organization, ids.datasource, ids.version)).rejects.toThrow('eligibility');

    expect(knowledge.save).not.toHaveBeenCalled();
    expect(chunks.save).not.toHaveBeenCalled();
    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(versions.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: ids.version }),
      expect.objectContaining({ status: DatasourceKnowledgeVersionStatus.Failed }),
    );
  });

  it('reuses a tenant-scoped content hash instead of embedding unchanged knowledge again', async () => {
    const { builder, chunks, embeddings } = setup();
    const content = 'payment_transactions represents the verified Payment concept.';
    chunks.find.mockResolvedValue([
      {
        contentHash: createHash('sha256').update(content.toLowerCase()).digest('hex'),
        embedding: '[0.1,0.2,0.3]',
      },
    ]);

    await builder.build(ids.organization, ids.datasource, ids.version);

    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(chunks.save).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ embedding: '[0.1,0.2,0.3]' })]),
    );
  });
});
