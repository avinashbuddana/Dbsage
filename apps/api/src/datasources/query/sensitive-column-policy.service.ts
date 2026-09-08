import { Injectable } from '@nestjs/common';

import { normalizeIdentifier } from '../context/database-context.types';

export type SensitiveColumnClassification = 'BLOCKED' | 'POTENTIALLY_SENSITIVE' | 'NONE';

const blockedPatterns = [
  'password',
  'passwordhash',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'privatekey',
  'apikey',
  'otp',
  'pin',
  'cvv',
];
const potentialPatterns = ['email', 'phone', 'address', 'dateofbirth', 'birthdate', 'ssn', 'socialsecurity'];
const systemSchemas = ['information_schema', 'mysql', 'performance_schema', 'sys'];

@Injectable()
export class SensitiveColumnPolicyService {
  classify(columnName: string): SensitiveColumnClassification {
    const normalized = normalizeIdentifier(columnName);
    if (blockedPatterns.some((pattern) => normalized.includes(pattern))) return 'BLOCKED';
    if (potentialPatterns.some((pattern) => normalized.includes(pattern))) return 'POTENTIALLY_SENSITIVE';
    return 'NONE';
  }

  questionRequestsBlockedColumn(question: string): boolean {
    const normalizedQuestion = normalizeIdentifier(question);
    return blockedPatterns.some((pattern) => normalizedQuestion.includes(pattern));
  }

  questionRequestsSystemSchema(question: string): boolean {
    const normalizedQuestion = question.toLowerCase();
    return systemSchemas.some((schema) => new RegExp(`\\b${schema}\\s*\\.`, 'i').test(normalizedQuestion));
  }
}
