import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './data-source';
import { ENTITIES } from './entities';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({ ...dataSourceOptions, retryAttempts: 2, retryDelay: 1000 }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
