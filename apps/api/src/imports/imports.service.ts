import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { AuditEvent, AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { DataImportEntity } from './entities/data-import.entity';
import { DataImportErrorCode } from './enums/data-import-error-code.enum';
import { DataImportProcessingMode } from './enums/data-import-processing-mode.enum';
import { DataImportStatus } from './enums/data-import-status.enum';
import { canTransitionDataImportStatus } from './import-status';
import type {
  CreateCsvImportInput,
  DataImportResponse,
  ImportClientConfiguration,
  ImportProgress,
  UploadedCsvFile,
} from './imports.types';
import type { PreparedCsvImport } from './processors/csv-import.processor';
import { CsvImportProcessor } from './processors/csv-import.processor';
import { ImportQueueService } from './queue/import-queue.service';
import { IMPORT_FILE_STORAGE, type ImportFileStorage } from './storage/import-file-storage.interface';

const PROGRESS_BYTES_INTERVAL = 1_048_576;
const PROGRESS_TIME_INTERVAL_MS = 2_000;

@Injectable()
export class ImportsService {
  constructor(
    @InjectRepository(DataImportEntity)
    private readonly repository: Repository<DataImportEntity>,
    private readonly processor: CsvImportProcessor,
    @Inject(IMPORT_FILE_STORAGE) private readonly storage: ImportFileStorage,
    private readonly queue: ImportQueueService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  async create(
    organizationId: string,
    input: CreateCsvImportInput,
    file: UploadedCsvFile,
  ): Promise<DataImportResponse> {
    let importEntity = await this.repository.save(
      this.repository.create({
        columnMapping: input.columnMapping,
        completedAt: null,
        createdByUserId: null,
        delimiter: input.delimiter,
        errorCode: null,
        errorMessage: null,
        failedRows: '0',
        fileDeletedAt: null,
        fileSizeBytes: String(file.sizeBytes),
        hasHeader: true,
        mimeType: file.mimeType,
        organizationId,
        originalFileName: file.originalFileName,
        processedBytes: '0',
        processedRows: '0',
        processingMode:
          file.sizeBytes > this.config.csvImport.queueThresholdBytes
            ? DataImportProcessingMode.Queued
            : DataImportProcessingMode.Synchronous,
        progressPercent: 0,
        queueJobId: null,
        startedAt: null,
        status: DataImportStatus.Uploaded,
        storedFileReference: file.fileReference,
        successfulRows: '0',
        targetSchema: input.targetSchema,
        targetTable: input.targetTable,
        totalRows: null,
      }),
    );
    await this.audit.record(organizationId, AuditEvent.CsvImportUploaded, {
      fileSizeBytes: importEntity.fileSizeBytes,
      importId: importEntity.id,
      targetSchema: importEntity.targetSchema,
      targetTable: importEntity.targetTable,
    });

    try {
      importEntity = await this.transition(importEntity, DataImportStatus.Validating);
      const prepared = await this.processor.prepare(importEntity);
      importEntity.columnMapping = prepared.columnMapping;
      if (importEntity.processingMode === DataImportProcessingMode.Queued) {
        importEntity = await this.transition(importEntity, DataImportStatus.Queued);
        importEntity = await this.enqueue(importEntity);
        await this.audit.record(organizationId, AuditEvent.CsvImportQueued, {
          importId: importEntity.id,
          targetSchema: importEntity.targetSchema,
          targetTable: importEntity.targetTable,
        });
        return this.toResponse(importEntity);
      }

      importEntity = await this.transition(importEntity, DataImportStatus.Processing, { startedAt: new Date() });
      await this.audit.record(organizationId, AuditEvent.CsvImportStarted, { importId: importEntity.id });
      return this.toResponse(await this.execute(importEntity, prepared));
    } catch (error) {
      importEntity = await this.fail(importEntity, error);
      if (error instanceof ServiceUnavailableException) throw error;
      return this.toResponse(importEntity);
    }
  }

  async processQueued(
    organizationId: string,
    importId: string,
    onProgress?: (progress: ImportProgress) => Promise<void>,
  ): Promise<void> {
    const claimed = await this.repository.update(
      { id: importId, organizationId, status: DataImportStatus.Queued },
      { startedAt: new Date(), status: DataImportStatus.Processing },
    );
    if (!claimed.affected) return;

    const importEntity = await this.getEntity(organizationId, importId);
    importEntity.status = DataImportStatus.Processing;
    importEntity.startedAt = new Date();
    try {
      await this.audit.record(organizationId, AuditEvent.CsvImportStarted, { importId });
      const prepared = await this.processor.prepare(importEntity);
      importEntity.columnMapping = prepared.columnMapping;
      await this.execute(importEntity, prepared, onProgress);
    } catch (error) {
      await this.fail(importEntity, error);
      throw new Error('CSV import failed');
    }
  }

  async retry(organizationId: string, importId: string): Promise<DataImportResponse> {
    let importEntity = await this.getEntity(organizationId, importId);
    if (importEntity.status !== DataImportStatus.Failed) {
      throw new ConflictException('Only failed imports can be retried');
    }
    if (!(await this.storage.exists(importEntity.storedFileReference))) {
      throw new NotFoundException('Import file is no longer available for retry');
    }
    const queued = await this.repository.update(
      { id: importId, organizationId, status: DataImportStatus.Failed },
      {
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        failedRows: '0',
        processedBytes: '0',
        processedRows: '0',
        progressPercent: 0,
        startedAt: null,
        status: DataImportStatus.Queued,
        successfulRows: '0',
      },
    );
    if (!queued.affected) throw new ConflictException('Import status changed before retry');

    importEntity.status = DataImportStatus.Queued;
    importEntity.errorCode = null;
    importEntity.errorMessage = null;
    importEntity.completedAt = null;
    try {
      importEntity = await this.enqueue(importEntity);
    } catch (error) {
      await this.fail(importEntity, error);
      throw new ServiceUnavailableException('CSV import retry could not be queued');
    }
    await this.audit.record(organizationId, AuditEvent.CsvImportRetried, { importId });
    return this.toResponse(importEntity);
  }

  async cancel(organizationId: string, importId: string): Promise<DataImportResponse> {
    const importEntity = await this.getEntity(organizationId, importId);
    if (importEntity.status !== DataImportStatus.Queued) {
      throw new ConflictException('Only queued imports can be cancelled');
    }
    await this.queue.cancel(importEntity.queueJobId);
    const cancelled = await this.repository.update(
      { id: importId, organizationId, status: DataImportStatus.Queued },
      { completedAt: new Date(), status: DataImportStatus.Cancelled },
    );
    if (!cancelled.affected) throw new ConflictException('Import status changed before cancellation');
    importEntity.status = DataImportStatus.Cancelled;
    importEntity.completedAt = new Date();
    await this.audit.record(organizationId, AuditEvent.CsvImportCancelled, { importId });
    return this.toResponse(importEntity);
  }

  async remove(organizationId: string, importId: string): Promise<void> {
    const importEntity = await this.getEntity(organizationId, importId);
    if (![DataImportStatus.Completed, DataImportStatus.Failed, DataImportStatus.Cancelled].includes(importEntity.status)) {
      throw new ConflictException('Only terminal import history can be deleted');
    }
    await this.storage.delete(importEntity.storedFileReference);
    await this.repository.delete({ id: importId, organizationId });
  }

  async findOne(organizationId: string, importId: string): Promise<DataImportResponse> {
    return this.toResponse(await this.getEntity(organizationId, importId));
  }

  async findAll(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<{ items: DataImportResponse[]; total: number }> {
    const [items, total] = await this.repository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      where: { organizationId },
    });
    return { items: items.map((item) => this.toResponse(item)), total };
  }

  getClientConfiguration(): ImportClientConfiguration {
    return {
      allowedDelimiters: [...this.config.csvImport.allowedDelimiters],
      maxColumns: this.config.csvImport.maxColumns,
      maxFileSizeBytes: this.config.csvImport.maxFileSizeBytes,
      maxHeaderLength: this.config.csvImport.maxHeaderLength,
      queueThresholdBytes: this.config.csvImport.queueThresholdBytes,
    };
  }

  private async execute(
    importEntity: DataImportEntity,
    prepared: PreparedCsvImport,
    onQueueProgress?: (progress: ImportProgress) => Promise<void>,
  ): Promise<DataImportEntity> {
    let lastPersistedBytes = Number(importEntity.processedBytes);
    let lastPersistedAt = 0;
    const result = await this.processor.process(importEntity, prepared, async (processedBytes) => {
      const now = Date.now();
      if (
        processedBytes - lastPersistedBytes < PROGRESS_BYTES_INTERVAL &&
        now - lastPersistedAt < PROGRESS_TIME_INTERVAL_MS
      ) {
        return;
      }
      const progress = this.progress(importEntity, processedBytes);
      await this.repository.update(
        { id: importEntity.id, organizationId: importEntity.organizationId, status: DataImportStatus.Processing },
        { processedBytes: String(processedBytes), progressPercent: progress.percent },
      );
      lastPersistedBytes = processedBytes;
      lastPersistedAt = now;
      await onQueueProgress?.(progress);
    });
    Object.assign(importEntity, {
      completedAt: new Date(),
      processedBytes: String(result.processedBytes),
      processedRows: String(result.rowCount),
      progressPercent: 100,
      successfulRows: String(result.rowCount),
      totalRows: String(result.rowCount),
    });
    const completed = await this.transition(importEntity, DataImportStatus.Completed);
    await this.audit.record(importEntity.organizationId, AuditEvent.CsvImportCompleted, {
      importId: importEntity.id,
      processedBytes: completed.processedBytes,
    });
    return completed;
  }

  private async transition(
    importEntity: DataImportEntity,
    status: DataImportStatus,
    values: Partial<DataImportEntity> = {},
  ): Promise<DataImportEntity> {
    if (!canTransitionDataImportStatus(importEntity.status, status)) {
      throw new ConflictException('Import status transition is invalid');
    }
    Object.assign(importEntity, values, { status });
    return this.repository.save(importEntity);
  }

  private async enqueue(importEntity: DataImportEntity): Promise<DataImportEntity> {
    const jobId = await this.queue.enqueue(importEntity.id, importEntity.organizationId);
    try {
      const attached = await this.repository.update(
        {
          id: importEntity.id,
          organizationId: importEntity.organizationId,
          status: DataImportStatus.Queued,
        },
        { queueJobId: jobId },
      );
      if (attached.affected) {
        importEntity.queueJobId = jobId;
        return importEntity;
      }
      return await this.getEntity(importEntity.organizationId, importEntity.id);
    } catch (error) {
      await this.queue.cancel(jobId).catch(() => undefined);
      throw error;
    }
  }

  private async fail(importEntity: DataImportEntity, error: unknown): Promise<DataImportEntity> {
    const details = this.errorDetails(error);
    if (importEntity.status !== DataImportStatus.Failed) {
      if (!canTransitionDataImportStatus(importEntity.status, DataImportStatus.Failed)) {
        return importEntity;
      }
      importEntity.status = DataImportStatus.Failed;
    }
    Object.assign(importEntity, {
      completedAt: new Date(),
      errorCode: details.code,
      errorMessage: details.message,
    });
    const failed = await this.repository.save(importEntity);
    await this.audit.record(importEntity.organizationId, AuditEvent.CsvImportFailed, {
      errorCode: details.code,
      importId: importEntity.id,
    });
    return failed;
  }

  private async getEntity(organizationId: string, importId: string): Promise<DataImportEntity> {
    const importEntity = await this.repository.findOne({ where: { id: importId, organizationId } });
    if (!importEntity) throw new NotFoundException('Import not found');
    return importEntity;
  }

  private progress(importEntity: DataImportEntity, processedBytes: number): ImportProgress {
    const fileSizeBytes = Number(importEntity.fileSizeBytes);
    return {
      processedBytes,
      fileSizeBytes,
      percent: Math.min(99, Math.floor((processedBytes / fileSizeBytes) * 100)),
    };
  }

  private errorDetails(error: unknown): { code: DataImportErrorCode; message: string } {
    const postgresCode =
      typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;
    switch (postgresCode) {
      case '22P02':
        return {
          code: DataImportErrorCode.ImportPostgresTypeError,
          message: 'CSV values do not match the target column types',
        };
      case '23503':
        return {
          code: DataImportErrorCode.ImportForeignKeyViolation,
          message: 'CSV values violate a target foreign-key constraint',
        };
      case '23505':
        return {
          code: DataImportErrorCode.ImportDuplicateValue,
          message: 'CSV values violate a unique target constraint',
        };
      case '23502':
        return {
          code: DataImportErrorCode.ImportConstraintViolation,
          message: 'CSV values violate a required target constraint',
        };
      case '57014':
        return { code: DataImportErrorCode.ImportTimeout, message: 'CSV import exceeded its time limit' };
      default:
        return { code: DataImportErrorCode.ImportCopyFailed, message: 'CSV import failed safely' };
    }
  }

  private toResponse(importEntity: DataImportEntity): DataImportResponse {
    return {
      id: importEntity.id,
      originalFileName: importEntity.originalFileName,
      fileSizeBytes: importEntity.fileSizeBytes,
      mimeType: importEntity.mimeType,
      targetSchema: importEntity.targetSchema,
      targetTable: importEntity.targetTable,
      status: importEntity.status,
      processingMode: importEntity.processingMode,
      delimiter: importEntity.delimiter,
      hasHeader: importEntity.hasHeader,
      totalRows: importEntity.totalRows,
      processedRows: importEntity.processedRows,
      successfulRows: importEntity.successfulRows,
      failedRows: importEntity.failedRows,
      processedBytes: importEntity.processedBytes,
      progressPercent: importEntity.progressPercent,
      errorCode: importEntity.errorCode,
      errorMessage: importEntity.errorMessage,
      startedAt: importEntity.startedAt,
      completedAt: importEntity.completedAt,
      createdAt: importEntity.createdAt,
      updatedAt: importEntity.updatedAt,
    };
  }
}
