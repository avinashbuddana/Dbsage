import { sanitizeStartupFailure } from './startup-failure';

describe('sanitizeStartupFailure', () => {
  it('keeps a useful bounded message while redacting secrets and URL credentials', () => {
    const failure = sanitizeStartupFailure(
      new Error(
        'Could not connect to postgres://schemaiq:database-password@localhost:5432/schemaiq; OPENROUTER_API_KEY=router-secret',
      ),
    );

    expect(failure).toEqual({
      errorType: 'Error',
      message:
        'Could not connect to postgres://schemaiq:[REDACTED]@localhost:5432/schemaiq; OPENROUTER_API_KEY=[REDACTED]',
    });
  });

  it('does not expose a non-Error startup value', () => {
    expect(sanitizeStartupFailure({ reason: 'unexpected' })).toEqual({
      errorType: 'UnknownError',
      message: 'No startup error message was provided',
    });
  });
});
