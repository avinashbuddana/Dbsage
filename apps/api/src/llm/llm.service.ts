import { Inject, Injectable } from '@nestjs/common';

import {
  LLM_PROVIDER,
  type LlmProvider,
  type StructuredLlmRequest,
  type StructuredLlmResponse,
  type TextLlmRequest,
  type TextLlmResponse,
} from './llm-provider.interface';

@Injectable()
export class LlmService {
  constructor(@Inject(LLM_PROVIDER) private readonly provider: LlmProvider) {}

  generateStructured<T>(request: StructuredLlmRequest<T>): Promise<StructuredLlmResponse<T>> {
    return this.provider.generateStructured(request);
  }

  generateText(request: TextLlmRequest): Promise<TextLlmResponse> {
    return this.provider.generateText(request);
  }
}
