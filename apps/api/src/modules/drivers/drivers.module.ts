import { Module } from '@nestjs/common';
import { AdminDriversController } from './admin-drivers.controller';
import { DriverMeController } from './driver-me.controller';
import { DriversService } from './drivers.service';

@Module({
  controllers: [AdminDriversController, DriverMeController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
