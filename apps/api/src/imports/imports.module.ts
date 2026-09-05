import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CsvImportUploadInterceptor } from './csv-import-upload.interceptor';
import { DataImportEntity } from './entities/data-import.entity';
import { FileHashService } from './hashing/file-hash.service';
import { ImportFileCleanupService } from './import-file-cleanup.service';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { CsvImportProcessor } from './processors/csv-import.processor';
import { BulkImportPostgresProvider } from './postgres/bulk-import-postgres.provider';
import { PostgresCopyService } from './postgres/postgres-copy.service';
import { PostgresIdentifierService } from './postgres/postgres-identifier.service';
import { PostgresImportTargetPolicyService } from './postgres/postgres-import-target-policy.service';
import { PostgresTableMetadataService } from './postgres/postgres-table-metadata.service';
import { ImportQueueService } from './queue/import-queue.service';
import { ImportWorkerService } from './queue/import-worker.service';
import { IMPORT_FILE_STORAGE } from './storage/import-file-storage.interface';
import { LocalImportFileStorage } from './storage/local-import-file-storage.service';
import { CsvHeaderValidator } from './validators/csv-header.validator';
import { PostgresColumnMappingValidator } from './validators/postgres-column-mapping.validator';

@Module({
  imports: [TypeOrmModule.forFeature([DataImportEntity]), AuditModule, AuthModule],
  controllers: [ImportsController],
  providers: [
    FileHashService,
    LocalImportFileStorage,
    { provide: IMPORT_FILE_STORAGE, useExisting: LocalImportFileStorage },
    CsvHeaderValidator,
    PostgresColumnMappingValidator,
    BulkImportPostgresProvider,
    PostgresIdentifierService,
    PostgresImportTargetPolicyService,
    PostgresTableMetadataService,
    PostgresCopyService,
    CsvImportProcessor,
    ImportQueueService,
    ImportsService,
    ImportWorkerService,
    ImportFileCleanupService,
    CsvImportUploadInterceptor,
  ],
})
export class ImportsModule {}
