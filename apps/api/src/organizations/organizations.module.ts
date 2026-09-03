import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationMemberEntity } from './organization-member.entity';
import { OrganizationEntity } from './organization.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationEntity, OrganizationMemberEntity])],
})
export class OrganizationsModule {}
