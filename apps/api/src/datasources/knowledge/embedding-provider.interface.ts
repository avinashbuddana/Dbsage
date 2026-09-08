export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

export interface EmbeddingProvider {
  readonly model: string;
  embed(inputs: readonly string[]): Promise<number[][]>;
}
