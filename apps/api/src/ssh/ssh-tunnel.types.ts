export interface SshTunnelHandle {
  host: '127.0.0.1';
  port: number;
  isHealthy(): boolean;
  close(): Promise<void>;
}
