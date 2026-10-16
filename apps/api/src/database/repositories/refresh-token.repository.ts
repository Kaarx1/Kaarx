import { Injectable } from '@nestjs/common';
import type { Role } from '@kaarx/shared';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { RefreshToken } from '../entities';

@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(RefreshToken);
  }

  async insert(values: Partial<RefreshToken>, manager?: EntityManager): Promise<void> {
    await this.repo(manager).insert(values);
  }

  findByHash(tokenHash: string, manager?: EntityManager): Promise<RefreshToken | null> {
    return this.repo(manager).findOneBy({ tokenHash });
  }

  async revokeById(id: string, manager?: EntityManager): Promise<boolean> {
    const result = await this.repo(manager).update(
      { id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return !!result.affected;
  }

  async revokeByHash(tokenHash: string, manager?: EntityManager): Promise<void> {
    await this.repo(manager).update({ tokenHash, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeAllForSubject(
    subjectType: Role,
    subjectId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.repo(manager).update(
      { subjectType, subjectId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
