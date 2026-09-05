import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In } from 'typeorm';
import type { Repository } from 'typeorm';

import { DataImportEntity } from '../entities/data-import.entity';
import { DataImportStatus } from '../enums/data-import-status.enum';
import { DuplicateImportException } from './duplicate-import.error';

const ACTIVE_STATUSES = [DataImportStatus.Queued, DataImportStatus.Processing, DataImportStatus.Completed];

@Injectable()
export class DuplicateImportService {
  constructor(
    @InjectRepository(DataImportEntity)
    private readonly repository: Repository<DataImportEntity>,
  ) {}

  async assertNotDuplicate(
    organizationId: string,
    targetSchema: string,
    targetTable: string,
    fileHash: string,
  ): Promise<void> {
    const existing = await this.repository.findOne({
      order: { createdAt: 'DESC' },
      where: {
        fileHash,
        organizationId,
        status: In(ACTIVE_STATUSES),
        targetSchema,
        targetTable,
      },
    });
    if (!existing) return;
    throw this.toException(existing, fileHash);
  }

  private toException(existing: DataImportEntity, fileHash: string): DuplicateImportException {
    if (existing.status === DataImportStatus.Completed) {
      return new DuplicateImportException(
        'DUPLICATE_IMPORT',
        `This file has already been imported into ${existing.targetSchema}.${existing.targetTable}.`,
        existing.id,
        fileHash,
        {
          failedRows: existing.failedRows,
          fileName: existing.originalFileName,
          importedAt: existing.completedAt ?? existing.updatedAt,
          successfulRows: existing.successfulRows,
          totalRows: existing.totalRows,
        },
      );
    }
    return new DuplicateImportException(
      'IMPORT_ALREADY_IN_PROGRESS',
      'This file is already being imported.',
      existing.id,
      fileHash,
    );
  }
}
