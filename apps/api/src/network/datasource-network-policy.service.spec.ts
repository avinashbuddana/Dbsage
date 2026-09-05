import { DatasourceNetworkPolicyService } from './datasource-network-policy.service';

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected action to throw');
}

describe('DatasourceNetworkPolicyService', () => {
  it.each(['http://db.example.com', 'mysql://db.example.com', '/tmp/mysql.sock', 'db;whoami'])(
    'rejects non-host input: %s',
    async (host) => {
      const policy = new DatasourceNetworkPolicyService(false);

      await expect(policy.validateTarget(host)).rejects.toMatchObject({
        code: 'DATASOURCE_NETWORK_BLOCKED',
      });
    },
  );

  it.each(['127.0.0.1', '::1', '169.254.169.254', 'fe80::1', 'metadata.google.internal'])(
    'blocks local or metadata destinations: %s',
    async (host) => {
      const policy = new DatasourceNetworkPolicyService(false);

      await expect(policy.validateTarget(host)).rejects.toMatchObject({
        code: 'DATASOURCE_NETWORK_BLOCKED',
      });
    },
  );

  it('still blocks link-local metadata addresses even with the local override enabled', async () => {
    const policy = new DatasourceNetworkPolicyService(true);

    await expect(policy.validateTarget('169.254.169.254')).rejects.toMatchObject({
      code: 'DATASOURCE_NETWORK_BLOCKED',
    });
    await expect(policy.validateTarget('fe80::1')).rejects.toMatchObject({
      code: 'DATASOURCE_NETWORK_BLOCKED',
    });
  });

  it('allows localhost only when the explicit development override is enabled', async () => {
    const policy = new DatasourceNetworkPolicyService(true);

    await expect(policy.validateTarget('127.0.0.1')).resolves.toBe('127.0.0.1');
  });

  describe('validateRemoteTarget (SSH_TUNNEL remote database host)', () => {
    it('allows private-network addresses reachable only through the tunnel', () => {
      const policy = new DatasourceNetworkPolicyService(false);

      expect(policy.validateRemoteTarget('10.1.2.3')).toBe('10.1.2.3');
      expect(policy.validateRemoteTarget('db.internal')).toBe('db.internal');
    });

    it('still blocks literal metadata addresses', () => {
      const policy = new DatasourceNetworkPolicyService(false);

      expect(() => policy.validateRemoteTarget('169.254.169.254')).toThrow();
      expect(captureError(() => policy.validateRemoteTarget('169.254.169.254'))).toMatchObject({
        code: 'DATASOURCE_NETWORK_BLOCKED',
      });
    });

    it('rejects non-host input', () => {
      const policy = new DatasourceNetworkPolicyService(false);

      expect(() => policy.validateRemoteTarget('http://db.example.com')).toThrow();
      expect(captureError(() => policy.validateRemoteTarget('http://db.example.com'))).toMatchObject(
        { code: 'DATASOURCE_NETWORK_BLOCKED' },
      );
    });
  });
});
