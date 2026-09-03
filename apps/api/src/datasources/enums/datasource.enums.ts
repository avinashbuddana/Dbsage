export enum DatasourceType {
  MySql = 'MYSQL',
}

export enum DatasourceConnectionMode {
  Direct = 'DIRECT',
  SshTunnel = 'SSH_TUNNEL',
  PrivateConnector = 'PRIVATE_CONNECTOR',
  Vpn = 'VPN',
}

export enum DatasourceStatus {
  Active = 'ACTIVE',
  ConnectionFailed = 'CONNECTION_FAILED',
  Disabled = 'DISABLED',
}

export enum SshAuthenticationType {
  PrivateKey = 'PRIVATE_KEY',
  Password = 'PASSWORD',
}

export enum DatasourceSecretType {
  DatabasePassword = 'DATABASE_PASSWORD',
  SshPassword = 'SSH_PASSWORD',
  SshPrivateKey = 'SSH_PRIVATE_KEY',
  SshPrivateKeyPassphrase = 'SSH_PRIVATE_KEY_PASSPHRASE',
}
