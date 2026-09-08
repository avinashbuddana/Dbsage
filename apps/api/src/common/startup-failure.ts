const MAX_STARTUP_ERROR_MESSAGE_LENGTH = 1_000;

const SENSITIVE_VALUE_PATTERN = /([a-z][a-z0-9_-]*(?:password|passphrase|secret|token|api[_-]?key|authorization|private[_-]?key|connection(?:string|url))[a-z0-9_-]*)\s*([:=])\s*("[^"]*"|'[^']*'|[^\s,;}\]]+)/gi;
const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi;

export interface SanitizedStartupFailure {
  errorType: string;
  message: string;
}

export function sanitizeStartupFailure(error: unknown): SanitizedStartupFailure {
  const errorType = error instanceof Error && error.name ? error.name : 'UnknownError';
  const rawMessage = error instanceof Error && error.message ? error.message : 'No startup error message was provided';
  const message = rawMessage
    .replace(URL_CREDENTIAL_PATTERN, '$1[REDACTED]@')
    .replace(SENSITIVE_VALUE_PATTERN, '$1$2[REDACTED]')
    .slice(0, MAX_STARTUP_ERROR_MESSAGE_LENGTH);

  return { errorType, message };
}
