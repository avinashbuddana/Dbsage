import { Exclude } from 'class-transformer';
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

import { DatasourceEntity } from '../datasources/entities/datasource.entity';
import { DatasourceSecretType } from '../datasources/enums/datasource.enums';

@Entity({ name: 'datasource_secrets' })
@Index('IDX_datasource_secrets_datasource_id', ['datasourceId'])
@Index('UQ_datasource_secrets_datasource_type', ['datasourceId', 'type'], { unique: true })
export class DatasourceSecretEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'datasource_id', type: 'uuid' })
  datasourceId!: string;

  @Column({ type: 'enum', enum: DatasourceSecretType, enumName: 'datasource_secret_type' })
  type!: DatasourceSecretType;

  @Exclude({ toPlainOnly: true })
  @Column({ name: 'encrypted_value', type: 'text', select: false })
  encryptedValue!: string;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', length: 24, select: false })
  iv!: string;

  @Exclude({ toPlainOnly: true })
  @Column({ name: 'auth_tag', type: 'varchar', length: 24, select: false })
  authTag!: string;

  @Column({ name: 'encryption_version', type: 'smallint' })
  encryptionVersion!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => DatasourceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'datasource_id' })
  datasource!: DatasourceEntity;
}
