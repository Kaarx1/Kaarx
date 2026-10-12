import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { AdminRole, Role, TokenPair } from '@kaarx/shared';
import { SESSION_EXPIRED, type AccessTokenPayload } from '../../common/auth/auth-user';
import { env } from '../../config/env';
import { RefreshToken } from '../../database/entities';

export interface TokenSubject {
  id: string;
  role: Role;
  adminRole?: AdminRole;
}

const DAY_MS = 86_400_000;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  async issue(subject: TokenSubject): Promise<TokenPair> {
    const payload: AccessTokenPayload = {
      sub: subject.id,
      role: subject.role,
      ...(subject.adminRole ? { adminRole: subject.adminRole } : {}),
    };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(32).toString('base64url');
    await this.refreshTokens.insert({
      subjectType: subject.role,
      subjectId: subject.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * DAY_MS),
    });
    return { accessToken, refreshToken };
  }

  async consume(raw: string): Promise<RefreshToken> {
    const row = await this.refreshTokens.findOneBy({ tokenHash: sha256(raw) });
    if (!row) throw new UnauthorizedException(SESSION_EXPIRED);
    if (row.revokedAt !== null) {
      await this.revokeAllForSubject(row.subjectType, row.subjectId);
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    if (row.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException(SESSION_EXPIRED);
    const result = await this.refreshTokens.update(
      { id: row.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (!result.affected) {
      // Lost a race with another refresh of the same token: treat as reuse.
      await this.revokeAllForSubject(row.subjectType, row.subjectId);
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    return row;
  }

  async revoke(raw: string): Promise<void> {
    await this.refreshTokens.update(
      { tokenHash: sha256(raw), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeAllForSubject(role: Role, subjectId: string): Promise<void> {
    await this.refreshTokens.update(
      { subjectType: role, subjectId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
