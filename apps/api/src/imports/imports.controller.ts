import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';

import type {
  DataImportSummaryResponse,
  ImportClientConfigurationResponse,
  ImportTargetSchemaResponse,
  ImportTargetTableResponse,
  ImportTargetDetailsResponse,
} from '@schemaiq/types';

import { OrganizationContextService } from '../auth/organization-context.service';
import { CsvImportUploadInterceptor } from './csv-import-upload.interceptor';
import { CreateCsvImportDto, parseColumnMapping } from './dto/create-import.dto';
import { ImportQueryDto } from './dto/import-query.dto';
import { ImportTargetSchemaParamsDto, ImportTargetTableParamsDto } from './dto/import-target.dto';
import { DataImportProcessingMode } from './enums/data-import-processing-mode.enum';
import type { DataImportResponse } from './imports.types';
import { ImportsService } from './imports.service';
import { PostgresTableMetadataService } from './postgres/postgres-table-metadata.service';

@Controller('imports')
export class ImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly organizationContext: OrganizationContextService,
    private readonly metadata: PostgresTableMetadataService,
  ) {}

  @Post('csv')
  @UseInterceptors(CsvImportUploadInterceptor)
  async create(
    @Body() input: CreateCsvImportDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DataImportResponse> {
    if (!file?.filename) throw new BadRequestException('CSV upload is required');
    const result = await this.imports.create(
      this.organizationContext.getOrganizationId(),
      {
        columnMapping: parseColumnMapping(input.columnMapping),
        delimiter: input.delimiter,
        targetSchema: input.targetSchema,
        targetTable: input.targetTable,
      },
      {
        fileReference: file.filename,
        mimeType: file.mimetype,
        originalFileName: file.originalname,
        sizeBytes: file.size,
      },
    );
    if (result.processingMode === DataImportProcessingMode.Queued) {
      response.status(HttpStatus.ACCEPTED);
    }
    return result;
  }

  @Get()
  findAll(@Query() query: ImportQueryDto): Promise<{ items: DataImportResponse[]; total: number }> {
    return this.imports.findAll(this.organizationContext.getOrganizationId(), query.page, query.limit);
  }

  @Get('config')
  getClientConfiguration(): ImportClientConfigurationResponse {
    return this.imports.getClientConfiguration();
  }

  @Get('summary')
  getSummary(): Promise<DataImportSummaryResponse> {
    return this.imports.summary(this.organizationContext.getOrganizationId());
  }

  @Get('targets/schemas')
  async listTargetSchemas(): Promise<ImportTargetSchemaResponse[]> {
    const schemas = await this.metadata.listSchemas();
    return schemas.map((name) => ({ name }));
  }

  @Get('targets/schemas/:schema/tables')
  listTargetTables(@Param() params: ImportTargetSchemaParamsDto): Promise<ImportTargetTableResponse[]> {
    return this.metadata.listTables(params.schema);
  }

  @Get('targets/schemas/:schema/tables/:table')
  async getTargetTable(@Param() params: ImportTargetTableParamsDto): Promise<ImportTargetDetailsResponse> {
    const table = await this.metadata.getTable(params.schema, params.table);
    return { ...table, columns: [...table.columns] };
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<DataImportResponse> {
    return this.imports.findOne(this.organizationContext.getOrganizationId(), id);
  }

  @Post(':id/retry')
  retry(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<DataImportResponse> {
    return this.imports.retry(this.organizationContext.getOrganizationId(), id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<DataImportResponse> {
    return this.imports.cancel(this.organizationContext.getOrganizationId(), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    return this.imports.remove(this.organizationContext.getOrganizationId(), id);
  }
}
