import { Module } from '@nestjs/common';
import { env } from '../../config/env';
import {
  HaversineRoutingProvider,
  OlaMapsRoutingProvider,
  RoutingProvider,
} from './routing.provider';
import { ZonesService } from './zones.service';

function createRoutingProvider(): RoutingProvider {
  if (env.ROUTING_PROVIDER === 'ola') {
    if (!env.OLA_MAPS_API_KEY)
      throw new Error('OLA_MAPS_API_KEY is required when ROUTING_PROVIDER=ola');
    return new OlaMapsRoutingProvider(env.OLA_MAPS_API_KEY);
  }
  return new HaversineRoutingProvider();
}

@Module({
  providers: [ZonesService, { provide: RoutingProvider, useFactory: createRoutingProvider }],
  exports: [ZonesService, RoutingProvider],
})
export class GeoModule {}
