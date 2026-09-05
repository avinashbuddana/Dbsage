import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'data_import_errors' })
@Index('IDX_data_import_errors_import_id', ['importId'])
export class DataImportErrorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'import_id', type: 'uuid' })
  importId!: string;

  @Column({ name: 'row_number', type: 'integer' })
  rowNumber!: number;

  @Column({ name: 'csv_column', type: 'varchar', length: 255 })
  csvColumn!: string;

  @Column({ name: 'database_column', type: 'varchar', length: 63 })
  databaseColumn!: string;

  @Column({ name: 'raw_value', type: 'text' })
  rawValue!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 50 })
  targetType!: string;

  @Column({ name: 'error_message', type: 'varchar', length: 500 })
  errorMessage!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
