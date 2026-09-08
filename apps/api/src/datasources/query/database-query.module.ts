import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LlmModule } from '../../llm/llm.module';
import { DatabaseContextModule } from '../context/database-context.module';
import { DatabaseCopilotRouterService } from './database-copilot-router.service';
import { DatabaseIntentClassifierService } from './database-intent-classifier.service';
import { GeneratedQueryEntity } from './generated-query.entity';
import { NaturalLanguageQueryPlannerService } from './natural-language-query-planner.service';
import { SensitiveColumnPolicyService } from './sensitive-column-policy.service';
import { SqlAstValidationService, SqlSafetyPolicyService } from './sql-ast-validation.service';
import { MySqlSqlCompiler, SqlCompilerService } from './sql-compiler.service';
import { SqlQueryPlanValidationService } from './sql-query-plan-validation.service';

@Module({
  imports: [TypeOrmModule.forFeature([GeneratedQueryEntity]), DatabaseContextModule, LlmModule],
  providers: [
    DatabaseCopilotRouterService,
    DatabaseIntentClassifierService,
    NaturalLanguageQueryPlannerService,
    SensitiveColumnPolicyService,
    SqlQueryPlanValidationService,
    MySqlSqlCompiler,
    SqlCompilerService,
    SqlAstValidationService,
    SqlSafetyPolicyService,
  ],
  exports: [DatabaseCopilotRouterService],
})
export class DatabaseQueryModule {}
