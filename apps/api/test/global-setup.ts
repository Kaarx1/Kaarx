import './setup-env';
import type { DataSource } from 'typeorm';

export default async function globalSetup(): Promise<void> {
  // require, not import(): node16 demands a .js specifier on dynamic imports, which jest cannot resolve
  const { default: dataSource } = require('../src/database/data-source') as {
    default: DataSource;
  };
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
