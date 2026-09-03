import 'reflect-metadata';

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';

import { validateEnvironment } from '../config/environment';
import { createCliDataSourceOptions } from './database.options';

config({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});

// CLI-only DataSource. Nest owns the single runtime pool through DatabaseModule.
const dataSource = new DataSource(createCliDataSourceOptions(validateEnvironment(process.env)));

export default dataSource;
