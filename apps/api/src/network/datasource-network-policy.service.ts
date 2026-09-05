import { Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { DatasourceConnectionError } from '../database-connections/datasource-connection.error';

const METADATA_HOSTS = new Set([
  '169.254.169.254',
  '100.100.100.200',
  'fd00:ec2::254',
  'metadata.google.internal',
  'metadata.google.internal.',
  'instance-data',
]);

function isValidHostname(host: string): boolean {
  if (host.length > 253 || host.includes('..')) return false;
  return host
    .replace(/\.$/, '')
    .split('.')
    .every((label) => /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/.test(label));
}

function isLocalAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('::ffff:')) return isLocalAddress(normalized.slice(7));

  const octets = normalized.split('.').map(Number);
  return octets.length === 4 && (octets[0] === 127 || octets.every((octet) => octet === 0));
}

// Link-local addresses (IPv4 169.254.0.0/16, IPv6 fe80::/10) are always blocked, even with
// ALLOW_LOCAL_DATASOURCES=true: 169.254.169.254 (and its IPv6 analogues) is where cloud metadata
// services live, so this class of address must never be reachable regardless of the dev override.
function isMetadataAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (METADATA_HOSTS.has(normalized) || normalized.startsWith('169.254.')) return true;
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
  return normalized.startsWith('::ffff:') && isMetadataAddress(normalized.slice(7));
}

@Injectable()
export class DatasourceNetworkPolicyService {
  constructor(private readonly allowLocalDatasources: boolean) {}

  async validateTarget(host: string): Promise<string> {
    const normalized = this.validateHost(host);

    const addresses = isIP(normalized)
      ? [normalized]
      : (await lookup(normalized, { all: true, verbatim: true })).map(({ address }) => address);
    if (
      addresses.some(
        (address) =>
          isMetadataAddress(address) || (!this.allowLocalDatasources && isLocalAddress(address)),
      )
    ) {
      throw this.blocked();
    }

    return host;
  }

  validateRemoteTarget(host: string): string {
    const normalized = this.validateHost(host);
    if (isIP(normalized) && isMetadataAddress(normalized)) throw this.blocked();
    return host;
  }

  private validateHost(host: string): string {
    const normalized = host.trim().toLowerCase();
    if (
      normalized !== host.toLowerCase() ||
      METADATA_HOSTS.has(normalized) ||
      (!isIP(normalized) && !isValidHostname(normalized))
    ) {
      throw this.blocked();
    }
    return normalized;
  }

  private blocked(): DatasourceConnectionError {
    return new DatasourceConnectionError(
      'DATASOURCE_NETWORK_BLOCKED',
      'The requested network destination is not allowed',
    );
  }
}
