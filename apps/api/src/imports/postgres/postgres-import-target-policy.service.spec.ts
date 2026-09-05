import { BadRequestException } from '@nestjs/common';

import { PostgresImportTargetPolicyService } from './postgres-import-target-policy.service';

describe('PostgresImportTargetPolicyService', () => {
  const policy = new PostgresImportTargetPolicyService();

  it.each([
    ['pg_catalog', 'pg_authid'],
    ['information_schema', 'tables'],
    ['public', 'datasource_secrets'],
    ['public', 'migrations'],
  ])('blocks protected import target %s.%s', (schema, table) => {
    expect(() => {
      policy.assertAllowed(schema, table);
    }).toThrow(BadRequestException);
  });

  it('allows a non-system application-owned target table', () => {
    expect(() => {
      policy.assertAllowed('public', 'customer_records');
    }).not.toThrow();
  });
});
