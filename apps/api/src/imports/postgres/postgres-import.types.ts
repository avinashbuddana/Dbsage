export interface PostgresColumnMetadata {
  name: string;
  dataType: string;
  isNullable: boolean;
  hasDefault: boolean;
  isGenerated: boolean;
  isIdentity: boolean;
  characterMaximumLength: number | null;
}

export interface PostgresTableMetadata {
  schema: string;
  table: string;
  columns: readonly PostgresColumnMetadata[];
}
