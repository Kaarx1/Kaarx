import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1760000000000 implements MigrationInterface {
  name = 'Init1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(readFileSync(join(__dirname, 'sql', '0001_init.sql'), 'utf8'));
  }

  async down(): Promise<void> {
    throw new Error('Init1760000000000 cannot be reverted; drop and recreate the database instead');
  }
}
