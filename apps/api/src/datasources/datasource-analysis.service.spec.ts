import { BadRequestException } from '@nestjs/common';

import { AuditEvent } from '../audit/audit.service';
import { LlmTask } from '../llm/enums/llm-task.enum';
import {
  compatibilityScore,
  DatasourceAnalysisService,
  specificationContext,
} from './datasource-analysis.service';

describe('DatasourceAnalysisService', () => {
  const dataSource = { query: jest.fn() };
  const connections = {
    withDataSource: jest.fn(
      async (_organizationId: string, _datasourceId: string, operation: (source: typeof dataSource) => Promise<unknown>) =>
        operation(dataSource),
    ),
  };
  const llm = { generateStructured: jest.fn(), generateText: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new DatasourceAnalysisService(
    connections as never,
    llm as never,
    audit as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps relevant sections from a large specification inside the model context bound', () => {
    const largeSpecification = `${'# General\n'.repeat(12_000)}# Orders\nOrders require customer_id and order_status.`;

    const context = specificationContext(largeSpecification, ['orders', 'customer_id']);

    expect(context.length).toBeLessThanOrEqual(8_000);
    expect(context).toContain('Orders require customer_id and order_status.');
  });

  it('lists accessible non-system databases through the managed datasource', async () => {
    dataSource.query.mockResolvedValue([
      { Database: 'mysql' },
      { Database: 'vapor' },
      { Database: 'analytics' },
    ]);

    await expect(service.listDatabases('organization-id', 'datasource-id')).resolves.toEqual([
      { name: 'analytics' },
      { name: 'vapor' },
    ]);
    expect(connections.withDataSource).toHaveBeenCalledWith(
      'organization-id',
      'datasource-id',
      expect.any(Function),
    );
  });

  it('sends only the selected database schema and current spec conversation to the LLM', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ Database: 'vapor' }])
      .mockResolvedValueOnce([{ tableName: 'users', tableType: 'BASE TABLE' }])
      .mockResolvedValueOnce([
        { columnName: 'id', columnType: 'bigint', isNullable: 'NO', tableName: 'users' },
      ]);
    llm.generateText.mockResolvedValue({ content: 'The users table covers the identity requirement.' });

    await expect(
      service.chat('organization-id', 'datasource-id', {
        databaseName: 'vapor',
        messages: [{ content: 'Does this meet the identity requirement?', role: 'user' }],
        specification: '# Identity\nUsers need a stable ID.',
      }),
    ).resolves.toEqual({
      content: 'The users table covers the identity requirement.',
      databaseName: 'vapor',
    });
    expect(llm.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        datasourceId: 'datasource-id',
        organizationId: 'organization-id',
        task: LlmTask.SpecCompatibilityExplanation,
      }),
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('information_schema.TABLES'),
      ['vapor'],
    );
    expect(audit.record).toHaveBeenCalledWith(
      'organization-id',
      AuditEvent.DatasourceSpecChatRequested,
      expect.objectContaining({ databaseName: 'vapor', datasourceId: 'datasource-id', tableCount: 1 }),
    );
  });

  it('returns a scored structured report for a queued specification analysis', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ Database: 'vapor' }])
      .mockResolvedValueOnce([{ tableName: 'users', tableType: 'BASE TABLE' }])
      .mockResolvedValueOnce([
        { columnName: 'id', columnType: 'bigint', isNullable: 'NO', tableName: 'users' },
      ]);
    llm.generateStructured.mockResolvedValue({
      data: {
        assumptions: ['The specification uses the selected schema only.'],
        requirements: [
          { evidence: 'users.id', requirement: 'Stable user identity', status: 'MATCHED' },
          { evidence: 'No audit table exists', requirement: 'Audit history', status: 'PARTIAL' },
          { evidence: 'No address column exists', requirement: 'Postal address', status: 'MISSING' },
        ],
        summary: 'Identity is covered; audit history and address data need work.',
      },
    });

    const result = await service.analyzeSpecification(
      'organization-id',
      'datasource-id',
      'vapor',
      '# Identity',
    );

    expect(result.databaseName).toBe('vapor');
    expect(result.matchScore).toBe(50);
    expect(result.report.requirements).toHaveLength(3);
    expect(llm.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ task: LlmTask.SpecSemanticMatching }),
    );
  });

  it('does not invent a match percentage when there are no assessable requirements', () => {
    expect(
      compatibilityScore({ assumptions: ['No data-model requirements were present.'], requirements: [], summary: 'No score.' }),
    ).toBeNull();
  });

  it('rejects a database name that the managed connection did not return', async () => {
    dataSource.query.mockResolvedValue([{ Database: 'vapor' }]);

    await expect(
      service.chat('organization-id', 'datasource-id', {
        databaseName: 'other',
        messages: [{ content: 'Check this.', role: 'user' }],
        specification: '# Spec',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(llm.generateText).not.toHaveBeenCalled();
  });
});
