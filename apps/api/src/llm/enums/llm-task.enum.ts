export enum LlmTask {
  SpecSectionClassification = 'SPEC_SECTION_CLASSIFICATION',
  SpecRequirementExtraction = 'SPEC_REQUIREMENT_EXTRACTION',
  SpecExpectedModelBuilding = 'SPEC_EXPECTED_MODEL_BUILDING',
  SpecEntityMatching = 'SPEC_ENTITY_MATCHING',
  SpecSemanticMatching = 'SPEC_SEMANTIC_MATCHING',
  SpecCompatibilityExplanation = 'SPEC_COMPATIBILITY_EXPLANATION',
  VerifiedKnowledgeGeneration = 'VERIFIED_KNOWLEDGE_GENERATION',
  DomainSummaryGeneration = 'DOMAIN_SUMMARY_GENERATION',
  DatabaseContextAnalysis = 'DATABASE_CONTEXT_ANALYSIS',
  DatabaseIntentClassification = 'DATABASE_INTENT_CLASSIFICATION',
  NaturalLanguageQueryPlanning = 'NATURAL_LANGUAGE_QUERY_PLANNING',
}

export enum LlmPromptVersion {
  SpecSectionClassificationV1 = 'SPEC_SECTION_CLASSIFICATION_V1',
  SpecRequirementExtractionV1 = 'SPEC_REQUIREMENT_EXTRACTION_V1',
  SpecExpectedModelBuildingV1 = 'SPEC_EXPECTED_MODEL_BUILDING_V1',
  SpecEntityMatchingV1 = 'SPEC_ENTITY_MATCHING_V1',
  SpecSemanticMatchingV1 = 'SPEC_SEMANTIC_MATCHING_V1',
  SpecCompatibilityExplanationV1 = 'SPEC_COMPATIBILITY_EXPLANATION_V1',
  VerifiedKnowledgeGenerationV1 = 'VERIFIED_KNOWLEDGE_GENERATION_V1',
  DomainSummaryGenerationV1 = 'DOMAIN_SUMMARY_GENERATION_V1',
  DatabaseContextAnalysisV1 = 'DATABASE_CONTEXT_ANALYSIS_V1',
  DatabaseIntentClassificationV1 = 'DATABASE_INTENT_CLASSIFICATION_V1',
  NaturalLanguageQueryPlanningV1 = 'NL_QUERY_PLANNER_V1',
}
