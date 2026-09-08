export class QueryGenerationError extends Error {
  constructor(
    readonly code:
      | 'QUERY_INTENT_UNSUPPORTED'
      | 'QUERY_MUTATION_NOT_ALLOWED'
      | 'QUERY_NEEDS_CLARIFICATION'
      | 'QUERY_CONTEXT_INSUFFICIENT'
      | 'QUERY_UNKNOWN_TABLE'
      | 'QUERY_UNKNOWN_COLUMN'
      | 'QUERY_INVALID_JOIN'
      | 'QUERY_INVALID_AGGREGATION'
      | 'QUERY_SENSITIVE_COLUMN_BLOCKED'
      | 'QUERY_SYSTEM_SCHEMA_BLOCKED'
      | 'QUERY_COMPLEXITY_EXCEEDED'
      | 'QUERY_AST_INVALID'
      | 'QUERY_NOT_READ_ONLY'
      | 'QUERY_MULTIPLE_STATEMENTS'
      | 'QUERY_GENERATION_FAILED'
      | 'QUERY_LLM_INVALID_RESPONSE'
      | 'QUERY_SCHEMA_SNAPSHOT_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'QueryGenerationError';
  }
}
