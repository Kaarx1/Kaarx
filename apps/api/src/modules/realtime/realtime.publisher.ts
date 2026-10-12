import { Inject, Injectable } from '@nestjs/common';
import type { RealtimeEventName } from '@kaarx/shared';
import { Emitter } from '@socket.io/redis-emitter';
import type { Redis } from 'ioredis';
import { REDIS } from '../../common/redis.module';

export const ADMINS_ROOM = 'admins';
export const customerRoom = (customerId: string): string => `customer:${customerId}`;
export const driverRoom = (driverId: string): string => `driver:${driverId}`;

@Injectable()
export class RealtimePublisher {
  private readonly emitter: Emitter;

  constructor(@Inject(REDIS) redis: Redis) {
    this.emitter = new Emitter(redis);
  }

  toCustomer(customerId: string, event: RealtimeEventName, payload: unknown): void {
    this.emitter.to(customerRoom(customerId)).emit(event, payload);
  }

  toDriver(driverId: string, event: RealtimeEventName, payload: unknown): void {
    this.emitter.to(driverRoom(driverId)).emit(event, payload);
  }

  toDrivers(driverIds: string[], event: RealtimeEventName, payload: unknown): void {
    if (driverIds.length === 0) return;
    this.emitter.to(driverIds.map(driverRoom)).emit(event, payload);
  }

  toAdmins(event: RealtimeEventName, payload: unknown): void {
    this.emitter.to(ADMINS_ROOM).emit(event, payload);
  }
}
