export type LlmProviderErrorCode =
  | 'LLM_AUTHENTICATION_FAILED'
  | 'LLM_CONCURRENCY_LIMIT'
  | 'LLM_PROMPT_REJECTED'
  | 'LLM_PROVIDER_REJECTED'
  | 'LLM_PROVIDER_UNAVAILABLE'
  | 'LLM_RATE_LIMITED'
  | 'LLM_RESPONSE_INVALID'
  | 'LLM_TIMEOUT';

export class LlmProviderError extends Error {
  constructor(
    readonly code: LlmProviderErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
