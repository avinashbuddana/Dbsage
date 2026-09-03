import { Module } from '@nestjs/common';

import { SshTunnelService } from './ssh-tunnel.service';

@Module({
  providers: [SshTunnelService],
  exports: [SshTunnelService],
})
export class SshModule {}
