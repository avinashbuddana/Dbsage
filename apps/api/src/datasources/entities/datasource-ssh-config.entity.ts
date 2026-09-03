import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { SshAuthenticationType } from '../enums/datasource.enums';
import { DatasourceEntity } from './datasource.entity';

@Entity({ name: 'datasource_ssh_configs' })
@Index('UQ_datasource_ssh_configs_datasource_id', ['datasourceId'], { unique: true })
export class DatasourceSshConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'datasource_id', type: 'uuid' })
  datasourceId!: string;

  @Column({ name: 'ssh_host', type: 'varchar', length: 253 })
  sshHost!: string;

  @Column({ name: 'ssh_port', type: 'integer', default: 22 })
  sshPort!: number;

  @Column({ name: 'ssh_username', type: 'varchar', length: 128 })
  sshUsername!: string;

  @Column({
    name: 'authentication_type',
    type: 'enum',
    enum: SshAuthenticationType,
    enumName: 'ssh_authentication_type',
  })
  authenticationType!: SshAuthenticationType;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne(() => DatasourceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'datasource_id' })
  datasource!: DatasourceEntity;
}
