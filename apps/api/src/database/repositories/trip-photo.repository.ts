import { Injectable } from '@nestjs/common';
import type { PhotoPhase, PhotoSide } from '@kaarx/shared';
import { DataSource, EntityManager } from 'typeorm';

export interface TripPhotoSideRow {
  phase: PhotoPhase;
  side: PhotoSide;
}

export interface TripPhotoRow {
  phase: PhotoPhase;
  side: PhotoSide;
  url: string;
  taken_at: Date;
}

@Injectable()
export class TripPhotoRepository {
  constructor(private readonly dataSource: DataSource) {}

  private manager(manager?: EntityManager) {
    return manager ?? this.dataSource.manager;
  }

  async insert(
    photo: {
      bookingId: string;
      driverId: string;
      phase: PhotoPhase;
      side: PhotoSide;
      url: string;
      takenAt: Date;
      lat: number | null;
      lng: number | null;
    },
    manager?: EntityManager,
  ): Promise<void> {
    await this.manager(manager).query(
      `insert into trip_photos (booking_id, driver_id, phase, side, url, taken_at, location)
       values ($1, $2, $3::photo_phase, $4::photo_side, $5, $6,
               case when $7::float8 is null or $8::float8 is null then null
                    else ST_SetSRID(ST_MakePoint($8::float8, $7::float8), 4326)::geography end)`,
      [
        photo.bookingId,
        photo.driverId,
        photo.phase,
        photo.side,
        photo.url,
        photo.takenAt,
        photo.lat,
        photo.lng,
      ],
    );
  }

  findSidesByBooking(bookingId: string, manager?: EntityManager): Promise<TripPhotoSideRow[]> {
    return this.manager(manager).query(
      `select distinct phase, side from trip_photos where booking_id = $1 order by phase, side`,
      [bookingId],
    );
  }

  findByBooking(bookingId: string, manager?: EntityManager): Promise<TripPhotoRow[]> {
    return this.manager(manager).query(
      `select phase, side, url, taken_at from trip_photos where booking_id = $1 order by phase, side, taken_at`,
      [bookingId],
    );
  }
}
