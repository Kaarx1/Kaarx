import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

export interface AuditEntry {
  adminId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

const toJson = (value: unknown): string | null =>
  value === undefined ? null : JSON.stringify(value);

@Injectable()
export class AuditService {
  constructor(private readonly dataSource: DataSource) {}

  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    await (manager ?? this.dataSource.manager).query(
      `insert into audit_logs (admin_id, action, entity_type, entity_id, before, after, ip)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::inet)`,
      [
        entry.adminId,
        entry.action,
        entry.entityType,
        entry.entityId,
        toJson(entry.before),
        toJson(entry.after),
        entry.ip ?? null,
      ],
    );
  }
}
