import type { z } from 'zod';

import type { LlmPromptVersion, LlmTask } from './enums/llm-task.enum';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export type LlmProviderName = 'OLLAMA' | 'OPENROUTER';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequestContext {
  organizationId: string;
  datasourceId?: string;
  specificationVersionId?: string;
  knowledgeVersionId?: string;
  task: LlmTask;
  messages: readonly LlmMessage[];
}

export type TextLlmRequest = LlmRequestContext;

export interface StructuredLlmRequest<T> extends LlmRequestContext {
  schemaName: string;
  schema: z.ZodType<T>;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface TextLlmResponse {
  content: string;
  provider: LlmProviderName;
  model: string;
  promptVersion: LlmPromptVersion;
  usage: LlmUsage;
}

export interface StructuredLlmResponse<T> {
  data: T;
  provider: LlmProviderName;
  model: string;
  promptVersion: LlmPromptVersion;
  usage: LlmUsage;
}

export interface LlmProvider {
  generateStructured<T>(request: StructuredLlmRequest<T>): Promise<StructuredLlmResponse<T>>;
  generateText(request: TextLlmRequest): Promise<TextLlmResponse>;
}
