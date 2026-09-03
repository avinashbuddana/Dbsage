import { Module } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import { DatasourceNetworkPolicyService } from './datasource-network-policy.service';

@Module({
  providers: [
    {
      provide: DatasourceNetworkPolicyService,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new DatasourceNetworkPolicyService(config.allowLocalDatasources),
    },
  ],
  exports: [DatasourceNetworkPolicyService],
})
export class NetworkModule {}
