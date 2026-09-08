import type { Repository } from 'typeorm';

import { AuditEvent } from '../audit/audit.service';
import { CredentialEncryptionService } from '../credentials/credential-encryption.service';
import { DatasourceStatus } from './enums/datasource.enums';
import { DatasourceSpecAnalysisStatus } from './enums/datasource-spec-analysis-status.enum';
import { DatasourceSpecAnalysisEntity } from './entities/datasource-spec-analysis.entity';
import { DatasourceSpecAnalysisService } from './datasource-spec-analysis.service';

const analysisId = '00000000-0000-4000-8000-000000000001';
const datasourceId = '00000000-0000-4000-8000-000000000002';
const organizationId = '00000000-0000-4000-8000-000000000003';

function entity(overrides: Partial<DatasourceSpecAnalysisEntity> = {}): DatasourceSpecAnalysisEntity {
  return Object.assign(new DatasourceSpecAnalysisEntity(), {
    completedAt: null,
    createdAt: new Date('2026-09-06T00:00:00Z'),
    databaseName: 'vapor',
    datasourceId,
    encryptedSpecification: null,
    errorCode: null,
    errorMessage: null,
    id: analysisId,
    organizationId,
    result: null,
    matchScore: null,
    report: null,
    specificationAuthTag: null,
    specificationEncryptionVersion: null,
    specificationIv: null,
    startedAt: null,
    status: DatasourceSpecAnalysisStatus.Queued,
    ...overrides,
  });
}

function setup() {
  const repository = {
    create: jest.fn((value: Partial<DatasourceSpecAnalysisEntity>) => entity(value)),
    createQueryBuilder: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    save: jest.fn((value: DatasourceSpecAnalysisEntity) => Promise.resolve(value)),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const datasources = { findOne: jest.fn().mockResolvedValue({ status: DatasourceStatus.Active }) };
  const knowledge = { analyzeAndPersist: jest.fn(), requestKnowledgeBuild: jest.fn() };
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const encryption = new CredentialEncryptionService(Buffer.alloc(32, 1).toString('base64'));
  const service = new DatasourceSpecAnalysisService(
    repository as unknown as Repository<DatasourceSpecAnalysisEntity>,
    datasources as never,
    queue as never,
    encryption,
    audit as never,
    knowledge as never,
  );
  return { audit, datasources, encryption, knowledge, queue, repository, service };
}

describe('DatasourceSpecAnalysisService', () => {
  it('encrypts a specification before persisting and queues only its analysis ID', async () => {
    const { queue, repository, service } = setup();

    const result = await service.create(organizationId, datasourceId, {
      databaseName: 'vapor',
      specification: '# Identity\nUsers need stable IDs.',
    });

    const created = repository.create.mock.calls[0]?.[0];
    expect(created?.status).toBe(DatasourceSpecAnalysisStatus.Queued);
    expect(typeof created?.encryptedSpecification).toBe('string');
    expect(created?.encryptedSpecification).not.toContain(
      'Users need stable IDs.',
    );
    expect(queue.enqueue).toHaveBeenCalledWith(analysisId, organizationId);
    expect(result).toEqual(expect.objectContaining({ id: analysisId, result: null }));
  });

  it('returns an active analysis instead of queueing the same database twice', async () => {
    const { queue, repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DatasourceSpecAnalysisStatus.Processing }));

    await expect(
      service.create(organizationId, datasourceId, {
        databaseName: 'vapor',
        specification: '# Replacement specification',
      }),
    ).resolves.toMatchObject({ id: analysisId, status: DatasourceSpecAnalysisStatus.Processing });

    expect(repository.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('uses the temporary encrypted source once, then stores only the result', async () => {
    const { audit, encryption, knowledge, repository, service } = setup();
    const encrypted = encryption.encrypt('# Orders\nOrders need a customer reference.');
    const source = entity({
      encryptedSpecification: encrypted.ciphertext,
      specificationAuthTag: encrypted.authTag,
      specificationEncryptionVersion: encrypted.version,
      specificationIv: encrypted.iv,
      status: DatasourceSpecAnalysisStatus.Processing,
    });
    const builder = {
      addSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(source),
      where: jest.fn().mockReturnThis(),
    };
    repository.createQueryBuilder.mockReturnValue(builder);
    knowledge.analyzeAndPersist.mockResolvedValue({
      compatibility: { knowledgeEligibility: 'NOT_ELIGIBLE', overallScore: 50 },
      databaseName: 'vapor',
      matchScore: 50,
      report: {
        assumptions: [],
        requirements: [
          { evidence: 'No customer_id column', requirement: 'Customer reference', status: 'MISSING' },
        ],
        summary: 'The orders table needs customer_id.',
      },
    });

    await service.processQueued(organizationId, analysisId);

    expect(knowledge.analyzeAndPersist).toHaveBeenCalledWith(
      organizationId,
      datasourceId,
      'vapor',
      '# Orders\nOrders need a customer reference.',
    );
    expect(repository.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: DatasourceSpecAnalysisStatus.Processing }),
      expect.objectContaining({
        encryptedSpecification: null,
        matchScore: 50,
        report: {
          assumptions: [],
          requirements: [
            { evidence: 'No customer_id column', requirement: 'Customer reference', status: 'MISSING' },
          ],
          summary: 'The orders table needs customer_id.',
        },
        result: 'The orders table needs customer_id.',
        specificationAuthTag: null,
        specificationEncryptionVersion: null,
        specificationIv: null,
        status: DatasourceSpecAnalysisStatus.Completed,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      organizationId,
      AuditEvent.DatasourceSpecAnalysisCompleted,
      expect.objectContaining({ analysisId, datasourceId }),
    );
  });

  it('clears the temporary source and exposes only a safe error when analysis fails', async () => {
    const { encryption, knowledge, repository, service } = setup();
    const encrypted = encryption.encrypt('# Spec');
    const builder = {
      addSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(
        entity({
          encryptedSpecification: encrypted.ciphertext,
          specificationAuthTag: encrypted.authTag,
          specificationEncryptionVersion: encrypted.version,
          specificationIv: encrypted.iv,
        }),
      ),
      where: jest.fn().mockReturnThis(),
    };
    repository.createQueryBuilder.mockReturnValue(builder);
    knowledge.analyzeAndPersist.mockRejectedValue(new Error('provider detail must not reach users'));

    await expect(service.processQueued(organizationId, analysisId)).rejects.toThrow(
      'provider detail must not reach users',
    );

    expect(repository.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: analysisId, organizationId }),
      expect.objectContaining({
        encryptedSpecification: null,
        errorCode: 'SPEC_ANALYSIS_FAILED',
        errorMessage: 'SchemaIQ could not complete this analysis.',
        matchScore: null,
        report: null,
        status: DatasourceSpecAnalysisStatus.Failed,
      }),
    );
  });

  it('requeues analyses that were abandoned while processing', async () => {
    const { queue, repository, service } = setup();
    repository.find.mockResolvedValue([
      entity({ startedAt: new Date(Date.now() - 31 * 60_000), status: DatasourceSpecAnalysisStatus.Processing }),
    ]);

    await expect(service.requeueStalledAnalyses()).resolves.toBe(1);

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: analysisId, status: DatasourceSpecAnalysisStatus.Processing }),
      expect.objectContaining({ startedAt: null, status: DatasourceSpecAnalysisStatus.Queued }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(analysisId, organizationId);
  });
});
