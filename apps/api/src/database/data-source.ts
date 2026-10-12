import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { env } from '../config/env';
import { ENTITIES } from './entities';
import { Init1760000000000 } from './migrations/1760000000000-init';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  entities: ENTITIES,
  migrations: [Init1760000000000],
  migrationsTableName: 'typeorm_migrations',
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  migrationsRun: false,
  extra: { max: 10 },
};

export default new DataSource(dataSourceOptions);
