import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { OrganizationContextService } from '../auth/organization-context.service';
import type { ConnectionTestResult } from '../database-connectors/database-connector.types';
import {
  CreateDatasourceDto,
  TestDatasourceConnectionDto,
  UpdateDatasourceDto,
} from './dto/datasource.dto';
import type { DatasourceResponse } from './datasource.types';
import { DatasourcesService } from './datasources.service';

@Controller('datasources')
export class DatasourcesController {
  constructor(
    private readonly datasources: DatasourcesService,
    private readonly organizationContext: OrganizationContextService,
  ) {}

  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  testConnection(@Body() input: TestDatasourceConnectionDto): Promise<ConnectionTestResult> {
    return this.datasources.testConnection(this.organizationContext.getOrganizationId(), input);
  }

  @Post()
  create(@Body() input: CreateDatasourceDto): Promise<DatasourceResponse> {
    return this.datasources.create(this.organizationContext.getOrganizationId(), input);
  }

  @Get()
  findAll(): Promise<DatasourceResponse[]> {
    return this.datasources.findAll(this.organizationContext.getOrganizationId());
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<DatasourceResponse> {
    return this.datasources.findOne(this.organizationContext.getOrganizationId(), id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  testSaved(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ConnectionTestResult> {
    return this.datasources.testSaved(this.organizationContext.getOrganizationId(), id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateDatasourceDto,
  ): Promise<DatasourceResponse> {
    return this.datasources.update(this.organizationContext.getOrganizationId(), id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    return this.datasources.remove(this.organizationContext.getOrganizationId(), id);
  }
}
