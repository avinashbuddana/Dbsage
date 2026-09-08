import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DatasourceWorkspacePage from './page';

const chatMutation = {
  isPending: false,
  mutateAsync: vi.fn().mockResolvedValue({
    content: 'The users table covers the identity requirement.',
    databaseName: 'vapor',
  }),
};

const analysisMutation = {
  isPending: false,
  mutateAsync: vi.fn().mockResolvedValue({ id: 'analysis-1', status: 'QUEUED' }),
};

const buildKnowledgeMutation = {
  isPending: false,
  mutateAsync: vi.fn().mockResolvedValue({ id: 'knowledge-1', status: 'BUILDING' }),
};

const refreshKnowledgeMutation = {
  isPending: false,
  mutateAsync: vi.fn().mockResolvedValue({ id: 'check-2', status: 'STRONG_MATCH' }),
};

const queryMutation = {
  isPending: false,
  mutateAsync: vi.fn().mockResolvedValue({
    clarificationCandidates: [],
    columns: ['id'],
    confidence: 0.95,
    id: 'query-1',
    intent: 'DATA_QUERY',
    knowledgeVersionId: null,
    parameters: [],
    queryPlan: {},
    question: 'Show recent users',
    reason: null,
    safety: { defaultLimitApplied: true, readOnly: true, validated: true },
    schemaSnapshotId: 'snapshot-1',
    sql: 'SELECT `id` FROM `users` LIMIT 100',
    status: 'VALIDATED',
    supported: true,
    tables: ['users'],
    warnings: [],
  }),
};

const compatibility = {
  data: null as {
    knowledgeEligibility: string;
    matchedCount: number;
    missingInDatabaseCount: number;
    needsReviewCount: number;
    overallScore: number;
    reason: string;
    status: string;
  } | null,
  error: null,
  isError: false,
  isLoading: false,
};

const findings = {
  data: null as {
    items: {
      columnName: string | null;
      description: string;
      id: string;
      recommendation: string | null;
      severity: string;
      tableName: string | null;
      title: string;
    }[];
    total: number;
  } | null,
  error: null,
  isError: false,
  isLoading: false,
};

const knowledgeStatus = {
  data: null as {
    activeKnowledgeVersion: string | null;
    chunkCount: number;
    knowledgeCount: number;
    staleness: string;
  } | null,
};

const latestAnalysis = {
  data: null as {
    databaseName: string;
    errorMessage: string | null;
    matchScore: number | null;
    report: {
      assumptions: string[];
      requirements: { evidence: string; requirement: string; status: 'MATCHED' | 'PARTIAL' | 'MISSING' }[];
      summary: string;
    } | null;
    result: string | null;
    specificationId: string | null;
    specificationVersionId: string | null;
    status: string;
  } | null,
};

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'source-1' }) }));

vi.mock('../../../../lib/queries/datasources-queries', () => ({
  useDatasources: () => ({
    data: [{ id: 'source-1', name: 'Production MySQL', status: 'ACTIVE' }],
    error: null,
    isError: false,
  }),
  useDatasourceDatabases: () => ({
    data: [{ name: 'vapor' }],
    error: null,
    isError: false,
    isLoading: false,
  }),
  useDatasourceCompatibility: () => compatibility,
  useDatasourceFindings: () => findings,
  useDatasourceKnowledgeStatus: () => knowledgeStatus,
  useLatestDatasourceSpecAnalysis: () => latestAnalysis,
}));

vi.mock('../../../../lib/queries/datasources-mutations', () => ({
  useBuildDatasourceKnowledge: () => buildKnowledgeMutation,
  useCreateDatasourceSpecAnalysis: () => analysisMutation,
  useDatasourceSpecChat: () => chatMutation,
  useGenerateDatasourceQuery: () => queryMutation,
  useRefreshDatasourceKnowledge: () => refreshKnowledgeMutation,
}));

describe('DatasourceWorkspacePage', () => {
  beforeEach(() => {
    chatMutation.mutateAsync.mockClear();
    analysisMutation.mutateAsync.mockClear();
    buildKnowledgeMutation.mutateAsync.mockClear();
    refreshKnowledgeMutation.mutateAsync.mockClear();
    queryMutation.mutateAsync.mockClear();
    compatibility.data = null;
    findings.data = null;
    knowledgeStatus.data = null;
    latestAnalysis.data = null;
  });

  it('queues an automatic analysis after reading spec.md and still supports a follow-up question', async () => {
    render(<DatasourceWorkspacePage />);

    expect(screen.getByRole('heading', { name: 'Spec chat' })).toBeInTheDocument();
    expect(screen.getByLabelText('Database')).toHaveValue('vapor');

    const specificationFile = new File(['# Identity\nUsers need a stable ID.'], 'spec.md', { type: 'text/markdown' });
    Object.defineProperty(specificationFile, 'text', {
      value: () => Promise.resolve('# Identity\nUsers need a stable ID.'),
    });
    const input = screen.getByLabelText('Choose spec.md');
    fireEvent.change(input, {
      target: { files: [specificationFile] },
    });
    await screen.findByText('spec.md');

    await waitFor(() => {
      expect(analysisMutation.mutateAsync).toHaveBeenCalledWith({
        databaseName: 'vapor',
        specification: '# Identity\nUsers need a stable ID.',
      });
    });

    fireEvent.change(screen.getByLabelText('Question about this specification'), {
      target: { value: 'Does this meet the identity requirement?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(chatMutation.mutateAsync).toHaveBeenCalledWith({
        databaseName: 'vapor',
        messages: [{ content: 'Does this meet the identity requirement?', role: 'user' }],
        specification: '# Identity\nUsers need a stable ID.',
      });
    });
    expect(await screen.findByText('The users table covers the identity requirement.')).toBeInTheDocument();
  });

  it('rejects a specification larger than 15 MB before reading it', async () => {
    render(<DatasourceWorkspacePage />);

    const oversizedFile = new File(['# Too large'], 'spec.md', { type: 'text/markdown' });
    Object.defineProperty(oversizedFile, 'size', { value: 15 * 1024 * 1024 + 1 });
    const read = vi.fn();
    Object.defineProperty(oversizedFile, 'text', { value: read });
    fireEvent.change(screen.getByLabelText('Choose spec.md'), { target: { files: [oversizedFile] } });

    expect(await screen.findByText('The specification must be 15 MB or smaller.')).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it('shows the persisted background result in the chat after the user returns', () => {
    latestAnalysis.data = {
      databaseName: 'vapor',
      errorMessage: null,
      matchScore: 75,
      report: {
        assumptions: [],
        requirements: [
          { evidence: 'users.id', requirement: 'Stable identity', status: 'MATCHED' },
          { evidence: 'No audit table', requirement: 'Audit history', status: 'PARTIAL' },
        ],
        summary: 'The users table covers the identity requirement.',
      },
      result: 'The users table covers the identity requirement.',
      specificationId: null,
      specificationVersionId: null,
      status: 'COMPLETED',
    };

    render(<DatasourceWorkspacePage />);

    expect(screen.getByText('The users table covers the identity requirement.')).toBeInTheDocument();
    expect(screen.getByText('Latest analysis: vapor')).toBeInTheDocument();
    expect(screen.getByText('Estimated schema coverage')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('1 matched · 1 partial · 0 gaps')).toBeInTheDocument();
  });

  it('shows verified assessment findings and knowledge actions for a completed analysis', async () => {
    latestAnalysis.data = {
      databaseName: 'vapor',
      errorMessage: null,
      matchScore: 90,
      report: { assumptions: [], requirements: [], summary: 'Strongly compatible.' },
      result: 'Strongly compatible.',
      specificationId: 'specification-1',
      specificationVersionId: 'version-1',
      status: 'COMPLETED',
    };
    compatibility.data = {
      knowledgeEligibility: 'ELIGIBLE',
      matchedCount: 8,
      missingInDatabaseCount: 1,
      needsReviewCount: 1,
      overallScore: 90,
      reason: 'The schema has enough verified anchors for trusted knowledge.',
      status: 'STRONG_MATCH',
    };
    findings.data = {
      items: [{
        columnName: 'email',
        description: 'The users email address is not unique.',
        id: 'finding-1',
        recommendation: 'Add a unique constraint.',
        severity: 'HIGH',
        tableName: 'users',
        title: 'Email needs a unique constraint',
      }],
      total: 1,
    };
    knowledgeStatus.data = {
      activeKnowledgeVersion: null,
      chunkCount: 0,
      knowledgeCount: 0,
      staleness: 'SCHEMA_CHANGED',
    };

    render(<DatasourceWorkspacePage />);

    expect(screen.getByRole('heading', { name: 'Verified knowledge' })).toBeInTheDocument();
    expect(screen.getByText('Eligible for verified knowledge')).toBeInTheDocument();
    expect(screen.getByText('Email needs a unique constraint')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Build knowledge' }));
    await waitFor(() => {
      expect(buildKnowledgeMutation.mutateAsync).toHaveBeenCalledWith({
        specificationId: 'specification-1',
        versionId: 'version-1',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh assessment' }));
    await waitFor(() => {
      expect(refreshKnowledgeMutation.mutateAsync).toHaveBeenCalledTimes(1);
    });
  });

  it('generates and displays a validated SQL preview without an execution control', async () => {
    render(<DatasourceWorkspacePage />);

    fireEvent.change(screen.getByLabelText('Database question'), { target: { value: 'Show recent users' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate SQL preview' }));

    await waitFor(() => {
      expect(queryMutation.mutateAsync).toHaveBeenCalledWith('Show recent users');
    });
    expect(await screen.findByText('Validated read-only preview')).toBeInTheDocument();
    expect(screen.getByLabelText('Generated SQL preview')).toHaveTextContent('SELECT `id` FROM `users` LIMIT 100');
    expect(screen.queryByRole('button', { name: /execute/i })).not.toBeInTheDocument();
  });

  it('retries a clarification with the selected table pinned', async () => {
    queryMutation.mutateAsync
      .mockResolvedValueOnce({
        clarificationCandidates: ['users'], columns: [], confidence: 0.9, id: null, intent: 'DATA_QUERY',
        knowledgeVersionId: null, parameters: [], queryPlan: null, question: 'Show latest users',
        reason: 'QUERY_NEEDS_CLARIFICATION', safety: { defaultLimitApplied: false, readOnly: true, validated: false },
        schemaSnapshotId: null, sql: null, status: 'NEEDS_CLARIFICATION', supported: false, tables: [], warnings: [],
      })
      .mockResolvedValueOnce({
        clarificationCandidates: [], columns: ['id'], confidence: 0.95, id: 'query-1', intent: 'DATA_QUERY',
        knowledgeVersionId: null, parameters: [], queryPlan: {}, question: 'Show latest users', reason: null,
        safety: { defaultLimitApplied: true, readOnly: true, validated: true }, schemaSnapshotId: 'snapshot-1',
        sql: 'SELECT `id` FROM `users` LIMIT 100', status: 'VALIDATED', supported: true, tables: ['users'], warnings: [],
      });
    render(<DatasourceWorkspacePage />);

    fireEvent.change(screen.getByLabelText('Database question'), { target: { value: 'Show latest users' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate SQL preview' }));
    expect(await screen.findByRole('button', { name: 'Use users' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use users' }));
    await waitFor(() => {
      expect(queryMutation.mutateAsync).toHaveBeenLastCalledWith('Show latest users Use only the `users` table.');
    });
    expect(await screen.findByText('Validated read-only preview')).toBeInTheDocument();
  });
});
