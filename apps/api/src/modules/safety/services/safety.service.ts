import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { REALTIME_EVENTS, type SosAdminView, type SosInput } from '@kaarx/shared';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BookingRepository, SosEventRepository, type SosRow } from '../../../database/repositories';
import { BookingEventsService } from '../../booking-events/services/booking-events.service';
import { RealtimePublisher } from '../../realtime/realtime.publisher';

function toSosView(row: SosRow): SosAdminView {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    raisedBy: {
      type: row.raised_by_type,
      id: row.raised_by_id,
      name: row.raised_by_name ?? 'Customer',
      phone: row.raised_by_phone ?? '',
    },
    booking:
      row.booking_id && row.booking_code && row.booking_status
        ? { id: row.booking_id, code: row.booking_code, status: row.booking_status }
        : null,
    location: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
    notes: row.notes,
  };
}

@Injectable()
export class SafetyService {
  constructor(
    private readonly ds: DataSource,
    private readonly sosRepo: SosEventRepository,
    private readonly bookingRepo: BookingRepository,
    private readonly events: BookingEventsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async raise(user: AuthUser, input: SosInput): Promise<{ id: string }> {
    if (input.bookingId) await this.requireOwnBooking(user, input.bookingId);
    const id = await this.ds.transaction(async (manager) => {
      const sosId = await this.sosRepo.insert(
        {
          bookingId: input.bookingId ?? null,
          raisedByType: user.role,
          raisedById: user.id,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
        },
        manager,
      );
      if (!sosId) throw new Error('SOS insert returned no id');
      if (input.bookingId)
        await this.events.record(input.bookingId, 'sos.raised', user, { sosId }, manager);
      return sosId;
    });
    this.realtime.toAdmins(REALTIME_EVENTS.sosRaised, await this.getView(id));
    return { id };
  }

  async listOpen(): Promise<SosAdminView[]> {
    const rows = await this.sosRepo.findOpen();
    return rows.map(toSosView);
  }

  async handle(admin: AuthUser, id: string, notes: string): Promise<SosAdminView> {
    await this.ds.transaction(async (manager) => {
      if (!(await this.sosRepo.markHandled(id, admin.id, notes, manager))) {
        if (!(await this.sosRepo.existsById(id, manager))) {
          throw new NotFoundException('SOS not found');
        }
        throw new ConflictException('This SOS has already been handled');
      }
      await this.audit.record(
        {
          adminId: admin.id,
          action: 'sos.handle',
          entityType: 'sos_event',
          entityId: id,
          before: { status: 'open' },
          after: { status: 'handled', notes },
        },
        manager,
      );
    });
    return this.getView(id);
  }

  private async requireOwnBooking(user: AuthUser, bookingId: string): Promise<void> {
    if (!(await this.bookingRepo.existsOwned(user, bookingId))) {
      throw new NotFoundException('Booking not found');
    }
  }

  private async getView(id: string): Promise<SosAdminView> {
    const row = await this.sosRepo.findById(id);
    if (!row) throw new NotFoundException('SOS not found');
    return toSosView(row);
  }
}
