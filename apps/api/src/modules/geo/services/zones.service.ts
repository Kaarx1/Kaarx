import { Injectable } from '@nestjs/common';
import type { LatLng } from '@kaarx/shared';
import { ZoneRepository, type ActiveZoneRow } from '../../../database/repositories/zone.repository';

@Injectable()
export class ZonesService {
  constructor(private readonly zoneRepo: ZoneRepository) {}

  findActiveZoneAt(point: LatLng): Promise<ActiveZoneRow | null> {
    return this.zoneRepo.findActiveAt(point);
  }

  isWithinDestinationRadius(zoneId: string, point: LatLng): Promise<boolean> {
    return this.zoneRepo.hasPointWithinDestinationRadius(zoneId, point);
  }
}
