import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuditModule } from './common/audit/audit.module';
import { AuthCoreModule } from './common/auth/auth-core.module';
import { RedisModule, redisConnectionOptions } from './common/redis.module';
import { DatabaseModule } from './database/database.module';
import { AdminBookingsModule } from './modules/admin-bookings/admin-bookings.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingEventsModule } from './modules/booking-events/booking-events.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { GeoModule } from './modules/geo/geo.module';
import { HealthModule } from './modules/health/health.module';
import { PresenceModule } from './modules/presence/presence.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SafetyModule } from './modules/safety/safety.module';
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthCoreModule,
    AuditModule,
    AuthModule,
    CustomersModule,
    DriversModule,
    GeoModule,
    PricingModule,
    RealtimeModule,
    PresenceModule,
    BullModule.forRoot({ connection: redisConnectionOptions() }),
    BookingEventsModule,
    DispatchModule,
    BookingsModule,
    StorageModule,
    SafetyModule,
    AdminBookingsModule,
  ],
})
export class AppModule {}
