import { DatabaseCopilotIntent } from '@schemaiq/types';

import { DatabaseIntentClassifierService } from './database-intent-classifier.service';

describe('DatabaseIntentClassifierService', () => {
  const llm = { generateStructured: jest.fn() };
  const service = new DatabaseIntentClassifierService(llm as never);

  it.each([
    ['What table contains payments?', DatabaseCopilotIntent.SchemaQuestion],
    ['What does payment_transactions mean?', DatabaseCopilotIntent.BusinessMeaning],
    ['How are users connected to orders?', DatabaseCopilotIntent.RelationshipAnalysis],
    ['How many failed payments happened yesterday?', DatabaseCopilotIntent.AggregationQuery],
    ['Show the last 20 failed payments', DatabaseCopilotIntent.DataQuery],
    ['Delete duplicate users', DatabaseCopilotIntent.UnsupportedMutation],
  ])('classifies clear requests without an LLM: %s', async (question, intent) => {
    await expect(service.classify('org', 'datasource', question)).resolves.toMatchObject({ intent });
    expect(llm.generateStructured).not.toHaveBeenCalled();
  });

  it('uses the LLM only for an ambiguous intent', async () => {
    llm.generateStructured.mockResolvedValueOnce({
      data: { confidence: 0.6, entities: [], filters: [], intent: DatabaseCopilotIntent.Unknown, metrics: [], requiresRowData: false, timeRange: null },
    });

    await expect(service.classify('org', 'datasource', 'Tell me about the strange thing')).resolves.toMatchObject({
      intent: DatabaseCopilotIntent.Unknown,
    });
    expect(llm.generateStructured).toHaveBeenCalledTimes(1);
  });
});
