import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './data-source';
import { ENTITIES } from './entities';
import { REPOSITORIES } from './repositories';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({ ...dataSourceOptions, retryAttempts: 2, retryDelay: 1000 }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  providers: REPOSITORIES,
  exports: [TypeOrmModule, ...REPOSITORIES],
})
export class DatabaseModule {}
