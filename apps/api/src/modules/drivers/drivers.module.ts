import { Module } from '@nestjs/common';
import { AdminDriversController } from './controllers/admin-drivers.controller';
import { DriverMeController } from './controllers/driver-me.controller';
import { DriversService } from './services/drivers.service';

@Module({
  controllers: [AdminDriversController, DriverMeController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
