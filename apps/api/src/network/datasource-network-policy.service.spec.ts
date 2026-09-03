import { DatasourceConnectionMode } from '../datasources/enums/datasource.enums';
import { DatasourceNetworkPolicyService } from './datasource-network-policy.service';

describe('DatasourceNetworkPolicyService', () => {
  it.each(['http://db.example.com', 'mysql://db.example.com', '/tmp/mysql.sock', 'db;whoami'])(
    'rejects non-host input: %s',
    async (host) => {
      const policy = new DatasourceNetworkPolicyService(false);

      await expect(policy.validateTarget(host, DatasourceConnectionMode.Direct)).rejects.toMatchObject(
        { code: 'DATASOURCE_NETWORK_BLOCKED' },
      );
    },
  );

  it.each(['127.0.0.1', '::1', '169.254.169.254', 'metadata.google.internal'])(
    'blocks local or metadata destinations: %s',
    async (host) => {
      const policy = new DatasourceNetworkPolicyService(false);

      await expect(policy.validateTarget(host, DatasourceConnectionMode.Direct)).rejects.toMatchObject(
        { code: 'DATASOURCE_NETWORK_BLOCKED' },
      );
    },
  );

  it('allows localhost only when the explicit development override is enabled', async () => {
    const policy = new DatasourceNetworkPolicyService(true);

    await expect(
      policy.validateTarget('127.0.0.1', DatasourceConnectionMode.Direct),
    ).resolves.toBe('127.0.0.1');
  });
});
