import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { RefreshToken } from '../entities';

@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(RefreshToken);
  }
}
