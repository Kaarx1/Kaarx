import {
  HttpException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { LatLng } from '@kaarx/shared';
import { haversineMeters } from './haversine';

export interface RouteEstimate {
  distanceM: number;
  durationS: number;
}

export abstract class RoutingProvider {
  abstract route(from: LatLng, to: LatLng): Promise<RouteEstimate>;
}

const ROAD_FACTOR = 1.3;
const CITY_SPEED_MPS = 25_000 / 3600;

export class HaversineRoutingProvider extends RoutingProvider {
  async route(from: LatLng, to: LatLng): Promise<RouteEstimate> {
    const distanceM = Math.round(haversineMeters(from, to) * ROAD_FACTOR);
    return { distanceM, durationS: Math.round(distanceM / CITY_SPEED_MPS) };
  }
}

interface OlaDirectionsResponse {
  routes?: { legs?: { distance?: number | string; duration?: number | string }[] }[];
}

const OLA_DIRECTIONS_URL = 'https://api.olamaps.io/routing/v1/directions';
const OLA_TIMEOUT_MS = 5000;

export class OlaMapsRoutingProvider extends RoutingProvider {
  constructor(private readonly apiKey: string) {
    super();
  }

  async route(from: LatLng, to: LatLng): Promise<RouteEstimate> {
    const url = new URL(OLA_DIRECTIONS_URL);
    url.searchParams.set('origin', `${from.lat},${from.lng}`);
    url.searchParams.set('destination', `${to.lat},${to.lng}`);
    url.searchParams.set('api_key', this.apiKey);

    const body = await this.fetchDirections(url);
    const legs = body.routes?.[0]?.legs ?? [];
    if (legs.length === 0)
      throw new UnprocessableEntityException('No driving route found between these places');
    return {
      distanceM: Math.round(legs.reduce((sum, leg) => sum + Number(leg.distance ?? 0), 0)),
      durationS: Math.round(legs.reduce((sum, leg) => sum + Number(leg.duration ?? 0), 0)),
    };
  }

  private async fetchDirections(url: URL): Promise<OlaDirectionsResponse> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'X-Request-Id': randomUUID() },
        signal: AbortSignal.timeout(OLA_TIMEOUT_MS),
      });
      if (!response.ok) throw new ServiceUnavailableException('Route service unavailable');
      return (await response.json()) as OlaDirectionsResponse;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Route service unavailable');
    }
  }
}
