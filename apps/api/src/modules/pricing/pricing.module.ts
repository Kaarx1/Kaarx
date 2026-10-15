import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { GeoModule } from '../geo/geo.module';
import { PricingController } from './controllers/pricing.controller';
import { PricingService } from './services/pricing.service';

@Module({
  imports: [GeoModule, CustomersModule],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
