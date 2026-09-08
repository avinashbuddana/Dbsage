import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'datasource_specifications' })
@Index('UQ_datasource_specifications_organization_datasource_database', ['organizationId', 'datasourceId', 'databaseName'], { unique: true })
export class DatasourceSpecificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'datasource_id', type: 'uuid' })
  datasourceId!: string;

  @Column({ name: 'database_name', type: 'varchar', length: 128 })
  databaseName!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
