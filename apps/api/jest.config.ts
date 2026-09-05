import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  watchman: false,
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@schemaiq/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@schemaiq/types$': '<rootDir>/../../packages/types/src/index.ts',
  },
  collectCoverageFrom: [
    'src/config/environment.ts',
    'src/common/request-id.ts',
    'src/health/health.controller.ts',
    'src/health/health.service.ts',
    'src/imports/**/*.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
