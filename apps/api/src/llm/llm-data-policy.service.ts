import { Injectable } from '@nestjs/common';

import type { LlmMessage } from './llm-provider.interface';
import { LlmProviderError } from './llm-provider.error';

const PROHIBITED_PROMPT_PATTERNS = [
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/i,
  /(?:mysql|mariadb|postgres(?:ql)?):\/\/[^\s/:]+:[^@\s]+@/i,
  /\b(?:password|passphrase|api[_ -]?key|access[_ -]?token|authorization|secret|private[_ -]?key|ssh[_ -]?key|encryption[_ -]?key)\s*[:=]\s*\S+/i,
];

@Injectable()
export class LlmDataPolicyService {
  assertSafeMessages(messages: readonly LlmMessage[]): void {
    if (messages.length === 0 || messages.some((message) => message.content.trim().length === 0)) {
      throw new LlmProviderError('LLM_PROMPT_REJECTED', 'LLM requests require non-empty messages', false);
    }

    if (messages.some((message) => PROHIBITED_PROMPT_PATTERNS.some((pattern) => pattern.test(message.content)))) {
      throw new LlmProviderError(
        'LLM_PROMPT_REJECTED',
        'LLM request contains prohibited secret material',
        false,
      );
    }
  }
}
