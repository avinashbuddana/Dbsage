'use client';

import {
  CompatibilityStatus,
  type DatabaseCopilotResponse,
  DatabaseSpecFindingSeverity,
  DatasourceKnowledgeStaleness,
  DatasourceSpecAnalysisStatus,
  DatasourceStatus,
  KnowledgeEligibilityStatus,
  type DatasourceSpecChatMessage,
  type SqlGenerationResult,
} from '@schemaiq/types';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ChangeEvent, type SyntheticEvent } from 'react';

import { PageHeader } from '../../../../components/ui/page-header';
import { Metric } from '../../../../components/ui/metric';
import {
  useBuildDatasourceKnowledge,
  useCreateDatasourceSpecAnalysis,
  useDatasourceSpecChat,
  useGenerateDatasourceQuery,
  useRefreshDatasourceKnowledge,
} from '../../../../lib/queries/datasources-mutations';
import {
  useDatasourceCompatibility,
  useDatasourceDatabases,
  useDatasourceFindings,
  useDatasourceKnowledgeStatus,
  useDatasources,
  useLatestDatasourceSpecAnalysis,
} from '../../../../lib/queries/datasources-queries';

const MAX_SPECIFICATION_BYTES = 15 * 1024 * 1024;

interface Feedback {
  message: string;
  tone: 'error' | 'success';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function label(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
}

function compatibilityClasses(status: CompatibilityStatus): string {
  if (status === CompatibilityStatus.StrongMatch || status === CompatibilityStatus.Matched) {
    return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  }
  if (status === CompatibilityStatus.PartiallyMatched || status === CompatibilityStatus.NeedsReview) {
    return 'bg-amber-50 text-amber-900 ring-amber-200';
  }
  return 'bg-red-50 text-red-800 ring-red-200';
}

function severityClasses(severity: DatabaseSpecFindingSeverity): string {
  if (severity === DatabaseSpecFindingSeverity.Critical || severity === DatabaseSpecFindingSeverity.High) {
    return 'bg-red-50 text-red-800 ring-red-200';
  }
  if (severity === DatabaseSpecFindingSeverity.Medium) {
    return 'bg-amber-50 text-amber-900 ring-amber-200';
  }
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function stalenessMessage(staleness: DatasourceKnowledgeStaleness): string {
  switch (staleness) {
    case DatasourceKnowledgeStaleness.Current:
      return 'Verified knowledge is current for the latest specification and schema snapshot.';
    case DatasourceKnowledgeStaleness.Rebuilding:
      return 'Verified knowledge is building in the background.';
    case DatasourceKnowledgeStaleness.SpecChanged:
      return 'The specification changed. Refresh the assessment before rebuilding knowledge.';
    case DatasourceKnowledgeStaleness.Failed:
      return 'The latest knowledge build failed. Start another build after reviewing the assessment.';
    default:
      return 'The schema changed or has not been assessed. Refresh before relying on verified knowledge.';
  }
}

function isSqlGenerationResult(result: DatabaseCopilotResponse): result is SqlGenerationResult {
  return 'sql' in result;
}

export default function DatasourceWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const datasources = useDatasources();
  const databases = useDatasourceDatabases(id);
  const chat = useDatasourceSpecChat(id);
  const generateQuery = useGenerateDatasourceQuery(id);
  const startAnalysis = useCreateDatasourceSpecAnalysis(id);
  const latestAnalysis = useLatestDatasourceSpecAnalysis(id);
  const completedAnalysis =
    latestAnalysis.data?.status === DatasourceSpecAnalysisStatus.Completed
      ? latestAnalysis.data
      : null;
  const compatibility = useDatasourceCompatibility(
    id,
    completedAnalysis?.specificationId,
    completedAnalysis?.specificationVersionId,
  );
  const findings = useDatasourceFindings(
    id,
    completedAnalysis?.specificationId,
    completedAnalysis?.specificationVersionId,
    { limit: 25, page: 1 },
  );
  const knowledgeStatus = useDatasourceKnowledgeStatus(id);
  const buildKnowledge = useBuildDatasourceKnowledge(id);
  const refreshKnowledge = useRefreshDatasourceKnowledge(id);
  const [databaseName, setDatabaseName] = useState('');
  const [specification, setSpecification] = useState('');
  const [specificationName, setSpecificationName] = useState('');
  const [question, setQuestion] = useState('');
  const [queryQuestion, setQueryQuestion] = useState('');
  const [queryResult, setQueryResult] = useState<DatabaseCopilotResponse | null>(null);
  const [queryFeedback, setQueryFeedback] = useState<string | null>(null);
  const [messages, setMessages] = useState<DatasourceSpecChatMessage[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [knowledgeFeedback, setKnowledgeFeedback] = useState<Feedback | null>(null);
  const [isReadingSpecification, setIsReadingSpecification] = useState(false);
  const datasource = datasources.data?.find((item) => item.id === id);
  const selectedDatabase = databaseName.length > 0 ? databaseName : (databases.data?.[0]?.name ?? '');
  const requirementCounts = completedAnalysis?.report?.requirements.reduce(
    (counts, requirement) => ({
      ...counts,
      [requirement.status]: counts[requirement.status] + 1,
    }),
    { MATCHED: 0, MISSING: 0, PARTIAL: 0 },
  );

  async function handleSpecification(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.md')) {
      setFeedback({ message: 'Choose a Markdown (.md) specification file.', tone: 'error' });
      return;
    }
    if (file.size > MAX_SPECIFICATION_BYTES) {
      setFeedback({ message: 'The specification must be 15 MB or smaller.', tone: 'error' });
      return;
    }

    if (!selectedDatabase) {
      setFeedback({ message: 'Choose a database before adding spec.md.', tone: 'error' });
      return;
    }

    setIsReadingSpecification(true);
    setFeedback({ message: `Uploading ${file.name} and starting analysis…`, tone: 'success' });
    try {
      const content = await file.text();
      if (!content.trim()) {
        setFeedback({ message: 'The specification file is empty.', tone: 'error' });
        return;
      }
      setSpecification(content);
      setSpecificationName(file.name);
      await startAnalysis.mutateAsync({ databaseName: selectedDatabase, specification: content });
      setFeedback({
        message: 'Analysis is queued in the background. You can leave this page and return for the result.',
        tone: 'success',
      });
    } catch (error) {
      setFeedback({
        message: errorMessage(error, 'SchemaIQ could not start this specification analysis.'),
        tone: 'error',
      });
    } finally {
      setIsReadingSpecification(false);
    }
  }

  async function handleSend(): Promise<void> {
    const content = question.trim();
    if (!selectedDatabase || !specification.trim() || !content) {
      setFeedback({ message: 'Choose a database, upload spec.md, and enter a question first.', tone: 'error' });
      return;
    }

    const nextMessages = [...messages, { content, role: 'user' as const }];
    setMessages(nextMessages);
    setQuestion('');
    setFeedback(null);

    try {
      const response = await chat.mutateAsync({
        databaseName: selectedDatabase,
        messages: nextMessages,
        specification,
      });
      setMessages((current) => [...current, { content: response.content, role: 'assistant' }]);
    } catch (error) {
      setMessages(messages);
      setQuestion(content);
      setFeedback({ message: errorMessage(error, 'SchemaIQ could not analyze this specification.'), tone: 'error' });
    }
  }

  async function handleGenerateQuery(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const content = queryQuestion.trim();
    if (!content) {
      setQueryFeedback('Enter a database question first.');
      return;
    }

    await requestQueryPreview(content);
  }

  async function requestQueryPreview(content: string): Promise<void> {
    setQueryFeedback(null);
    setQueryResult(null);
    try {
      setQueryResult(await generateQuery.mutateAsync(content));
    } catch (error) {
      setQueryFeedback(errorMessage(error, 'SchemaIQ could not generate a query preview.'));
    }
  }

  async function handleClarificationCandidate(table: string): Promise<void> {
    const content = `${queryQuestion.trim()} Use only the \`${table}\` table.`;
    setQueryQuestion(content);
    await requestQueryPreview(content);
  }

  async function handleBuildKnowledge(): Promise<void> {
    if (!completedAnalysis?.specificationId || !completedAnalysis.specificationVersionId) return;

    setKnowledgeFeedback(null);
    try {
      await buildKnowledge.mutateAsync({
        specificationId: completedAnalysis.specificationId,
        versionId: completedAnalysis.specificationVersionId,
      });
      setKnowledgeFeedback({ message: 'Verified knowledge is building in the background.', tone: 'success' });
    } catch (error) {
      setKnowledgeFeedback({
        message: errorMessage(error, 'SchemaIQ could not start the verified knowledge build.'),
        tone: 'error',
      });
    }
  }

  async function handleRefreshKnowledge(): Promise<void> {
    setKnowledgeFeedback(null);
    try {
      await refreshKnowledge.mutateAsync();
      setKnowledgeFeedback({
        message: 'The latest schema snapshot has been checked against this specification.',
        tone: 'success',
      });
    } catch (error) {
      setKnowledgeFeedback({
        message: errorMessage(error, 'SchemaIQ could not refresh the compatibility assessment.'),
        tone: 'error',
      });
    }
  }

  const isDisabled = datasource?.status === DatasourceStatus.Disabled;
  const analysisIsRunning =
    isReadingSpecification ||
    latestAnalysis.data?.status === DatasourceSpecAnalysisStatus.Queued ||
    latestAnalysis.data?.status === DatasourceSpecAnalysisStatus.Processing;
  const persistedMessages: DatasourceSpecChatMessage[] =
    latestAnalysis.data?.status === DatasourceSpecAnalysisStatus.Completed && latestAnalysis.data.result
      ? [{ content: latestAnalysis.data.result, role: 'assistant' }]
      : [];
  const visibleMessages = [...persistedMessages, ...messages];
  const analysisStatus = isReadingSpecification
    ? 'Uploading and queueing analysis…'
    : latestAnalysis.data?.status === DatasourceSpecAnalysisStatus.Queued
      ? 'Analysis is queued in the background. You can leave this page and return.'
      : latestAnalysis.data?.status === DatasourceSpecAnalysisStatus.Processing
        ? 'SchemaIQ is checking this specification against the selected database in the background.'
        : latestAnalysis.data?.status === DatasourceSpecAnalysisStatus.Failed
          ? (latestAnalysis.data.errorMessage ?? 'SchemaIQ could not complete this analysis.')
          : null;
  const knowledgeIsBuilding =
    buildKnowledge.isPending || knowledgeStatus.data?.staleness === DatasourceKnowledgeStaleness.Rebuilding;
  const knowledgeCanBeBuilt = compatibility.data?.knowledgeEligibility === KnowledgeEligibilityStatus.Eligible;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/data-sources" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All data sources
      </Link>

      <PageHeader
        eyebrow="Analysis workspace"
        title={datasource?.name ?? 'Data source'}
        description="Choose a database and upload spec.md. SchemaIQ starts a background compatibility analysis automatically."
      />

      {datasources.isError ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage(datasources.error, 'SchemaIQ could not load this data source.')}
        </p>
      ) : isDisabled ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Enable this data source before selecting a database or analyzing a specification.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="flex h-fit flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="font-semibold text-slate-900">1. Select database</h2>
              <p className="mt-1 text-sm text-slate-600">Only databases your MySQL user can access are shown.</p>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Database
              <select
                value={selectedDatabase}
                disabled={databases.isLoading || !databases.data?.length}
                onChange={(event) => {
                  setDatabaseName(event.target.value);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {databases.isLoading ? <option>Loading databases…</option> : null}
                {databases.data?.map((database) => <option key={database.name} value={database.name}>{database.name}</option>)}
              </select>
            </label>
            {databases.isError ? (
              <p role="alert" className="text-sm text-red-700">{errorMessage(databases.error, 'Could not load databases.')}</p>
            ) : databases.data?.length === 0 ? (
              <p className="text-sm text-slate-600">No application databases are available to this MySQL user.</p>
            ) : null}

            <div className="border-t border-slate-200 pt-5">
              <h2 className="font-semibold text-slate-900">2. Add spec.md</h2>
              <p className="mt-1 text-sm text-slate-600">Markdown only, up to 15 MB. Uploading starts analysis automatically; the result remains here after you return.</p>
              <label className={`mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-700 ${analysisIsRunning ? 'cursor-not-allowed bg-slate-50 text-slate-400' : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50'}`}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                {analysisIsRunning ? 'Analysis in progress' : specificationName ? 'Replace spec.md' : 'Choose spec.md'}
                <input accept=".md,text/markdown" className="sr-only" disabled={analysisIsRunning} onChange={(event) => {
                  void handleSpecification(event);
                }} type="file" />
              </label>
              {analysisIsRunning ? <p className="mt-3 text-sm text-slate-600">Wait for this analysis to finish before uploading another specification.</p> : null}
              {specificationName && (
                <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {specificationName}
                </p>
              )}
              {latestAnalysis.data?.databaseName && (
                <p className="mt-3 text-sm text-slate-600">Latest analysis: {latestAnalysis.data.databaseName}</p>
              )}
            </div>
            {completedAnalysis?.matchScore !== null && completedAnalysis?.matchScore !== undefined && requirementCounts && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Estimated schema coverage</p>
                <p className="mt-1 text-3xl font-semibold text-blue-950">{completedAnalysis.matchScore}%</p>
                <p className="mt-2 text-sm text-blue-900">
                  {requirementCounts.MATCHED} matched · {requirementCounts.PARTIAL} partial · {requirementCounts.MISSING} gaps
                </p>
                <p className="mt-2 text-xs leading-5 text-blue-800">Based on requirements the model could assess from this specification and schema.</p>
              </div>
            )}
          </aside>

          <div className="flex min-w-0 flex-col gap-6">
            {completedAnalysis ? (
              <section aria-labelledby="verified-knowledge" className="rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 id="verified-knowledge" className="flex items-center gap-2 font-semibold text-slate-900">
                      <ShieldCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />
                      Verified knowledge
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">Only an eligible compatibility result can become reusable database knowledge.</p>
                  </div>
                  {compatibility.data ? (
                    <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${compatibilityClasses(compatibility.data.status)}`}>
                      {label(compatibility.data.status)}
                    </span>
                  ) : null}
                </div>

                <div className="p-5">
                  {compatibility.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading the verified assessment…
                    </div>
                  ) : compatibility.isError ? (
                    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                      {errorMessage(compatibility.error, 'SchemaIQ could not load the compatibility assessment.')}
                    </p>
                  ) : compatibility.data ? (
                    <div className="flex flex-col gap-5">
                      <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-5 sm:grid-cols-4">
                        <Metric label="Compatibility" value={`${String(compatibility.data.overallScore)}%`} />
                        <Metric label="Matched" value={String(compatibility.data.matchedCount)} />
                        <Metric label="Gaps" value={String(compatibility.data.missingInDatabaseCount)} />
                        <Metric label="Needs review" value={String(compatibility.data.needsReviewCount)} />
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {compatibility.data.knowledgeEligibility === KnowledgeEligibilityStatus.Eligible
                              ? 'Eligible for verified knowledge'
                              : 'Not eligible for verified knowledge'}
                          </p>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{compatibility.data.reason}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void handleRefreshKnowledge();
                            }}
                            disabled={refreshKnowledge.isPending || knowledgeIsBuilding}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {refreshKnowledge.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                            Refresh assessment
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleBuildKnowledge();
                            }}
                            disabled={!knowledgeCanBeBuilt || knowledgeIsBuilding}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {knowledgeIsBuilding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                            {knowledgeIsBuilding ? 'Building knowledge' : 'Build knowledge'}
                          </button>
                        </div>
                      </div>

                      {knowledgeStatus.data ? (
                        <div className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700" aria-live="polite">
                          {knowledgeStatus.data.staleness === DatasourceKnowledgeStaleness.Current ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                          ) : (
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                          )}
                          <div>
                            <p>{stalenessMessage(knowledgeStatus.data.staleness)}</p>
                            {knowledgeStatus.data.activeKnowledgeVersion ? (
                              <p className="mt-1 text-slate-500">
                                {knowledgeStatus.data.knowledgeCount} knowledge records · {knowledgeStatus.data.chunkCount} embeddings
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {knowledgeFeedback ? (
                        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${knowledgeFeedback.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                          {knowledgeFeedback.message}
                        </p>
                      ) : null}

                      <details open className="border-t border-slate-100 pt-4">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                          Findings{findings.data ? ` (${String(findings.data.total)})` : ''}
                        </summary>
                        <div className="mt-3">
                          {findings.isLoading ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              Loading findings…
                            </div>
                          ) : findings.isError ? (
                            <p role="alert" className="text-sm text-red-700">
                              {errorMessage(findings.error, 'SchemaIQ could not load compatibility findings.')}
                            </p>
                          ) : findings.data?.items.length ? (
                            <ul className="divide-y divide-slate-100">
                              {findings.data.items.map((finding) => (
                                <li key={finding.id} className="py-3 first:pt-0 last:pb-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1 ${severityClasses(finding.severity)}`}>
                                      {label(finding.severity)}
                                    </span>
                                    <p className="text-sm font-medium text-slate-900">{finding.title}</p>
                                    {finding.tableName ? <span className="font-mono text-xs text-slate-500">{finding.tableName}{finding.columnName ? `.${finding.columnName}` : ''}</span> : null}
                                  </div>
                                  <p className="mt-1 text-sm leading-6 text-slate-600">{finding.description}</p>
                                  {finding.recommendation ? <p className="mt-1 text-sm text-slate-700">Recommended: {finding.recommendation}</p> : null}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-slate-600">No compatibility findings were recorded for this assessment.</p>
                          )}
                        </div>
                      </details>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

          <section aria-labelledby="query-preview" className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="query-preview" className="flex items-center gap-2 font-semibold text-slate-900">
                <Sparkles className="h-5 w-5 text-blue-600" aria-hidden="true" />
                Query preview
              </h2>
              <p className="mt-1 text-sm text-slate-600">Ask about the database to generate a validated, read-only SQL preview. It is never executed here.</p>
            </div>
            <div className="p-5">
              <form onSubmit={(event) => {
                void handleGenerateQuery(event);
              }} className="flex flex-col gap-3">
                <label htmlFor="database-query" className="text-sm font-medium text-slate-700">Database question</label>
                <textarea
                  id="database-query"
                  value={queryQuestion}
                  disabled={generateQuery.isPending}
                  aria-describedby="database-query-help"
                  maxLength={1_000}
                  onChange={(event) => {
                    setQueryQuestion(event.target.value);
                  }}
                  placeholder="For example: Show the last 20 failed payments"
                  rows={3}
                  className="resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 disabled:bg-slate-50"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p id="database-query-help" className="text-xs text-slate-500">Only a preview is generated; SchemaIQ does not run customer SQL.</p>
                  <button type="submit" disabled={generateQuery.isPending} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {generateQuery.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                    {generateQuery.isPending ? 'Generating preview' : 'Generate SQL preview'}
                  </button>
                </div>
              </form>

              {generateQuery.isPending ? <p role="status" className="mt-4 text-sm text-slate-600">Checking the saved schema and generating a safe preview…</p> : null}
              {queryFeedback ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{queryFeedback}</p> : null}
              {queryResult ? (
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  {isSqlGenerationResult(queryResult) ? (
                    queryResult.supported && queryResult.sql ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">Validated read-only preview</span>
                          <span className="text-xs text-slate-500">{label(queryResult.status)}</span>
                        </div>
                        <pre aria-label="Generated SQL preview" className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm leading-6 text-slate-100"><code>{queryResult.sql}</code></pre>
                        <p className="text-sm text-slate-600">Tables: {queryResult.tables.join(', ') || 'None'}</p>
                        {queryResult.parameters.length ? <p className="text-sm text-slate-600">Parameter types: {queryResult.parameters.map((parameter) => label(parameter.type)).join(', ')}</p> : null}
                        {queryResult.warnings.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">{queryResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">No SQL preview was generated.</p>
                        <p>{queryResult.reason ? label(queryResult.reason) : 'SchemaIQ could not safely generate this query.'}</p>
                        {queryResult.clarificationCandidates.length ? (
                          <div className="flex flex-col gap-2">
                            <p>Select the table you mean to retry the question:</p>
                            <div className="flex max-h-48 flex-wrap gap-2 overflow-auto" aria-label="Possible tables">
                              {queryResult.clarificationCandidates.map((table) => (
                                <button
                                  key={table}
                                  type="button"
                                  disabled={generateQuery.isPending}
                                  onClick={() => {
                                    void handleClarificationCandidate(table);
                                  }}
                                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-700 hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Use {table}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col gap-2 text-sm text-slate-700">
                      <p className="font-medium text-slate-900">This question is answered from the saved schema; no SQL is needed.</p>
                      <p className="leading-6">{queryResult.analysis.answer}</p>
                      {queryResult.analysis.uncertainties.length ? <p className="text-slate-500">{queryResult.analysis.uncertainties.join(' ')}</p> : null}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="spec-chat" className="flex min-h-[32rem] flex-col rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="spec-chat" className="flex items-center gap-2 font-semibold text-slate-900">
                <Bot className="h-5 w-5 text-blue-600" aria-hidden="true" />
                Spec chat
              </h2>
              <p className="mt-1 text-sm text-slate-600">The first compatibility report appears automatically. Upload spec.md again on this page to ask follow-up questions.</p>
            </div>
            <div className="flex flex-1 flex-col gap-4 overflow-auto p-5" aria-live="polite">
              {visibleMessages.length === 0 ? (
                <p className="m-auto max-w-sm text-center text-sm text-slate-500">Choose a database, then upload a specification. SchemaIQ will start the first analysis automatically.</p>
              ) : (
                visibleMessages.map((message, index) => (
                  <div key={`${message.role}-${String(index)}`} className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'ml-auto bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                    {message.content}
                  </div>
                ))
              )}
              {analysisStatus && (
                <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{analysisStatus}</div>
              )}
              {chat.isPending && (
                <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Analyzing specification…</div>
              )}
            </div>
            {feedback && <p role="status" className={`mx-5 mb-3 rounded-lg px-3 py-2 text-sm ${feedback.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{feedback.message}</p>}
            <div className="border-t border-slate-200 p-4">
              <label className="sr-only" htmlFor="spec-question">Question about this specification</label>
              <div className="flex gap-3">
                <textarea
                  id="spec-question"
                  value={question}
                  disabled={chat.isPending || analysisIsRunning || !specification.trim()}
                  maxLength={4_000}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                  }}
                  placeholder={specification.trim() ? 'For example: Which requirements are not represented by this schema?' : 'Upload spec.md to ask a follow-up question.'}
                  rows={2}
                  className="min-w-0 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 disabled:bg-slate-50"
                />
                <button type="button" onClick={() => {
                  void handleSend();
                }} disabled={chat.isPending || analysisIsRunning || !specification.trim()} className="inline-flex self-end items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Send
                </button>
              </div>
            </div>
          </section>
          </div>
        </div>
      )}
    </div>
  );
}
