export interface HealthResponse {
  status: 'ok';
  service: 'schemaiq-api';
}

export interface ReadinessResponse extends HealthResponse {
  checks: {
    postgres: 'up';
    redis: 'up';
  };
}
