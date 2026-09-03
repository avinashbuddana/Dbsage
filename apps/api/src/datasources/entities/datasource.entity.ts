import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { OrganizationEntity } from '../../organizations/organization.entity';
import {
  DatasourceConnectionMode,
  DatasourceStatus,
  DatasourceType,
} from '../enums/datasource.enums';

@Entity({ name: 'datasources' })
@Index('IDX_datasources_organization_id', ['organizationId'])
@Index('UQ_datasources_organization_name', ['organizationId', 'name'], { unique: true })
export class DatasourceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'database_type', type: 'enum', enum: DatasourceType, enumName: 'datasource_type' })
  databaseType!: DatasourceType;

  @Column({
    name: 'connection_mode',
    type: 'enum',
    enum: DatasourceConnectionMode,
    enumName: 'datasource_connection_mode',
  })
  connectionMode!: DatasourceConnectionMode;

  @Column({ type: 'varchar', length: 253 })
  host!: string;

  @Column({ type: 'integer' })
  port!: number;

  @Column({ name: 'database_name', type: 'varchar', length: 128 })
  databaseName!: string;

  @Column({ type: 'varchar', length: 128 })
  username!: string;

  @Column({ name: 'ssl_enabled', type: 'boolean', default: false })
  sslEnabled!: boolean;

  @Column({ type: 'enum', enum: DatasourceStatus, enumName: 'datasource_status' })
  status!: DatasourceStatus;

  @Column({ name: 'last_connected_at', type: 'timestamptz', nullable: true })
  lastConnectedAt!: Date | null;

  @Column({ name: 'last_connection_error_code', type: 'varchar', length: 80, nullable: true })
  lastConnectionErrorCode!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: OrganizationEntity;
}
