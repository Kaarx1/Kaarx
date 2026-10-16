import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './data-source';
import { REPOSITORIES } from './repositories';

@Global()
@Module({
  imports: [TypeOrmModule.forRoot({ ...dataSourceOptions, retryAttempts: 2, retryDelay: 1000 })],
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class DatabaseModule {}
