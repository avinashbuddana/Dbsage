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
  Query,
} from '@nestjs/common';

import { OrganizationContextService } from '../auth/organization-context.service';
import type { ConnectionTestResult } from '../database-connectors/database-connector.types';
import {
  CreateDatasourceDto,
  TestDatasourceConnectionDto,
  UpdateDatasourceDto,
} from './dto/datasource.dto';
import {
  DatasourceFindingQueryDto,
  DatasourceSpecAnalysisDto,
  DatasourceSpecChatDto,
} from './dto/datasource-analysis.dto';
import { DatabaseAnalyzeDto, DatabaseContextSearchDto } from './dto/database-context.dto';
import { DatabaseQueryDto } from './dto/database-query.dto';
import { DatasourceAnalysisService } from './datasource-analysis.service';
import { DatasourceSpecAnalysisService } from './datasource-spec-analysis.service';
import { DatabaseAnalyzerService } from './context/database-analyzer.service';
import { DatabaseContextService } from './context/database-context.service';
import { DatabaseCopilotRouterService } from './query/database-copilot-router.service';
import { DatasourceKnowledgeService } from './knowledge/datasource-knowledge.service';
import type { DatasourceResponse } from './datasource.types';
import { DatasourcesService } from './datasources.service';

@Controller('datasources')
export class DatasourcesController {
  constructor(
    private readonly datasources: DatasourcesService,
    private readonly analysis: DatasourceAnalysisService,
    private readonly specAnalyses: DatasourceSpecAnalysisService,
    private readonly knowledge: DatasourceKnowledgeService,
    private readonly databaseContext: DatabaseContextService,
    private readonly databaseAnalyzer: DatabaseAnalyzerService,
    private readonly databaseCopilot: DatabaseCopilotRouterService,
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

  @Get(':id/databases')
  listDatabases(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<{ name: string }[]> {
    return this.analysis.listDatabases(this.organizationContext.getOrganizationId(), id);
  }

  @Post(':id/spec-chat')
  @HttpCode(HttpStatus.OK)
  chatAboutSpec(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: DatasourceSpecChatDto,
  ): Promise<{ databaseName: string; content: string }> {
    return this.analysis.chat(this.organizationContext.getOrganizationId(), id, input);
  }

  @Post(':id/spec-analyses')
  @HttpCode(HttpStatus.ACCEPTED)
  startSpecificationAnalysis(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: DatasourceSpecAnalysisDto,
  ) {
    return this.specAnalyses.create(this.organizationContext.getOrganizationId(), id, input);
  }

  @Get(':id/spec-analyses/latest')
  latestSpecificationAnalysis(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.specAnalyses.findLatest(this.organizationContext.getOrganizationId(), id);
  }

  @Get(':id/specifications/:specificationId/versions/:versionId/compatibility')
  compatibility(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('specificationId', new ParseUUIDPipe({ version: '4' })) specificationId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string,
  ) {
    return this.knowledge.findCompatibility(
      this.organizationContext.getOrganizationId(),
      id,
      specificationId,
      versionId,
    );
  }

  @Get(':id/specifications/:specificationId/versions/:versionId/findings')
  findings(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('specificationId', new ParseUUIDPipe({ version: '4' })) specificationId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string,
    @Query() query: DatasourceFindingQueryDto,
  ) {
    return this.knowledge.findFindings(
      this.organizationContext.getOrganizationId(),
      id,
      specificationId,
      versionId,
      query.page ?? 1,
      query.limit ?? 25,
      query,
    );
  }

  @Post(':id/specifications/:specificationId/versions/:versionId/knowledge/build')
  @HttpCode(HttpStatus.ACCEPTED)
  buildKnowledge(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('specificationId', new ParseUUIDPipe({ version: '4' })) specificationId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' })) versionId: string,
  ) {
    return this.knowledge.requestKnowledgeBuild(
      this.organizationContext.getOrganizationId(),
      id,
      specificationId,
      versionId,
    );
  }

  @Get(':id/knowledge/status')
  knowledgeStatus(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.knowledge.knowledgeStatus(this.organizationContext.getOrganizationId(), id);
  }

  @Post(':id/knowledge/refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  refreshKnowledge(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.knowledge.refreshLatest(this.organizationContext.getOrganizationId(), id);
  }

  @Post(':id/context/search')
  @HttpCode(HttpStatus.OK)
  searchContext(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: DatabaseContextSearchDto,
  ) {
    return this.databaseContext.build(this.organizationContext.getOrganizationId(), id, input);
  }

  @Post(':id/analyze')
  @HttpCode(HttpStatus.OK)
  analyzeDatabase(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: DatabaseAnalyzeDto,
  ) {
    return this.databaseAnalyzer.analyze(this.organizationContext.getOrganizationId(), id, input);
  }

  @Get(':id/analyze/overview')
  analyzeOverview(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.databaseAnalyzer.overview(this.organizationContext.getOrganizationId(), id);
  }

  @Get(':id/analyze/root-entities')
  rootEntities(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.databaseAnalyzer.rootEntities(this.organizationContext.getOrganizationId(), id);
  }

  @Post(':id/query/classify')
  @HttpCode(HttpStatus.OK)
  classifyQuery(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: DatabaseQueryDto,
  ) {
    return this.databaseCopilot.classify(this.organizationContext.getOrganizationId(), id, input.question);
  }

  @Post(':id/query/generate')
  @HttpCode(HttpStatus.OK)
  generateQuery(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: DatabaseQueryDto,
  ) {
    return this.databaseCopilot.generate(this.organizationContext.getOrganizationId(), id, input.question);
  }

  @Post(':id/query/:queryId/validate')
  @HttpCode(HttpStatus.OK)
  validateGeneratedQuery(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('queryId', new ParseUUIDPipe({ version: '4' })) queryId: string,
  ) {
    return this.databaseCopilot.validateGenerated(this.organizationContext.getOrganizationId(), id, queryId);
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
