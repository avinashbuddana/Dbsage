# Milestone 5 — LLM gateway test evidence

## Scope

The gateway makes server-side model calls through `LlmService` and the `LLM_PROVIDER` abstraction. Development uses configured loopback Ollama first, while other environments use it after retryable cloud failures. It does not implement specification ingestion, a controller, LLM-driven database access, or user model settings.

## Focused behavior checks

- Environment validation requires the OpenRouter secret and supplies bounded LLM defaults; a fallback list cannot repeat the default model.
- Every authorized task resolves its configured default model and a stable V1 prompt-version identifier through `LlmModelConfigService`.
- Structured calls send strict JSON-schema response format, then independently validate returned JSON with their Zod schema.
- Invalid structured output is retried only up to `LLM_MAX_RETRIES` and is never returned as valid data.
- OpenRouter failures are converted to sanitized typed errors; upstream error bodies are not exposed.
- A retryable exhausted OpenRouter path uses configured local Ollama; rejected prompts never reach it.
- Development uses configured Ollama first and falls back to OpenRouter only after a retryable local failure.
- Ollama accepts JSON-schema structured work and cannot be configured with a non-loopback URL.
- Obvious secret material is rejected before `fetch` runs.
- The provider fails promptly at `LLM_MAX_CONCURRENCY`, avoiding an in-memory prompt queue.
- Telemetry persists identifiers and non-content usage fields only; it does not accept prompt/message fields.

Run focused checks with:

```bash
pnpm --filter @schemaiq/api exec jest src/llm --runInBand
```
