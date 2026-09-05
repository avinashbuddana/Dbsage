import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DataImportMode } from '../enums/data-import-mode.enum';
import { DataImportProcessingMode } from '../enums/data-import-processing-mode.enum';
import { DataImportStatus } from '../enums/data-import-status.enum';

@Entity({ name: 'data_imports' })
@Index('IDX_data_imports_organization_id', ['organizationId'])
@Index('IDX_data_imports_organization_created_at', ['organizationId', 'createdAt'])
@Index('IDX_data_imports_status', ['status'])
export class DataImportEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @Column({ name: 'original_file_name', type: 'varchar', length: 255 })
  originalFileName!: string;

  @Column({ name: 'stored_file_reference', type: 'varchar', length: 64 })
  storedFileReference!: string;

  @Column({ name: 'file_size_bytes', type: 'bigint' })
  fileSizeBytes!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 128 })
  mimeType!: string;

  @Column({ name: 'file_hash', type: 'varchar', length: 64 })
  fileHash!: string;

  @Column({ name: 'target_schema', type: 'varchar', length: 63 })
  targetSchema!: string;

  @Column({ name: 'target_table', type: 'varchar', length: 63 })
  targetTable!: string;

  @Column({ name: 'column_mapping', type: 'jsonb', default: () => "'{}'::jsonb" })
  columnMapping!: Record<string, string>;

  @Column({
    type: 'enum',
    enum: DataImportStatus,
    enumName: 'data_import_status',
    default: DataImportStatus.Uploaded,
  })
  status!: DataImportStatus;

  @Column({
    name: 'processing_mode',
    type: 'enum',
    enum: DataImportProcessingMode,
    enumName: 'data_import_processing_mode',
  })
  processingMode!: DataImportProcessingMode;

  @Column({ type: 'char', length: 1 })
  delimiter!: string;

  @Column({
    name: 'import_mode',
    type: 'enum',
    enum: DataImportMode,
    enumName: 'data_import_mode',
    default: DataImportMode.Strict,
  })
  importMode!: DataImportMode;

  @Column({ name: 'date_format', type: 'varchar', length: 20, nullable: true })
  dateFormat!: string | null;

  @Column({ name: 'array_delimiter', type: 'varchar', length: 5, nullable: true })
  arrayDelimiter!: string | null;

  @Column({ name: 'has_header', type: 'boolean', default: true })
  hasHeader!: boolean;

  @Column({ name: 'total_rows', type: 'bigint', nullable: true })
  totalRows!: string | null;

  @Column({ name: 'processed_rows', type: 'bigint', default: '0' })
  processedRows!: string;

  @Column({ name: 'successful_rows', type: 'bigint', default: '0' })
  successfulRows!: string;

  @Column({ name: 'failed_rows', type: 'bigint', default: '0' })
  failedRows!: string;

  @Column({ name: 'processed_bytes', type: 'bigint', default: '0' })
  processedBytes!: string;

  @Column({ name: 'progress_percent', type: 'smallint', default: 0 })
  progressPercent!: number;

  @Column({ name: 'queue_job_id', type: 'varchar', length: 64, nullable: true })
  queueJobId!: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 500, nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'file_deleted_at', type: 'timestamptz', nullable: true })
  fileDeletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
