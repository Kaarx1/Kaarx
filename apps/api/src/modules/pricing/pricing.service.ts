import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  computeFare,
  computeSettlement,
  type BodyType,
  type FareBreakdown,
  type LatLng,
  type PricingRuleInput,
} from '@kaarx/shared';
import { Repository } from 'typeorm';
import { PricingRule } from '../../database/entities';
import { RoutingProvider } from '../geo/routing.provider';
import { ZonesService } from '../geo/zones.service';

export interface Quote {
  cityId: string;
  zoneId: string;
  pricingRuleId: string;
  distanceM: number;
  durationS: number;
  breakdown: FareBreakdown;
  driverEarningPaise: number;
}

export function toRuleInput(rule: PricingRule): PricingRuleInput {
  return {
    baseFarePaise: rule.baseFarePaise,
    includedKm: rule.includedKm,
    perKmPaise: rule.perKmPaise,
    serviceFeePaise: rule.serviceFeePaise,
    platformCommissionPct: rule.platformCommissionPct,
    freeWaitingMin: rule.freeWaitingMin,
    waitingPerMinPaise: rule.waitingPerMinPaise,
    minFarePaise: rule.minFarePaise,
  };
}

@Injectable()
export class PricingService {
  constructor(
    private readonly zones: ZonesService,
    private readonly routing: RoutingProvider,
    @InjectRepository(PricingRule) private readonly rules: Repository<PricingRule>,
  ) {}

  async quote(input: { pickup: LatLng; dropoff: LatLng; bodyType: BodyType }): Promise<Quote> {
    const zone = await this.zones.findActiveZoneAt(input.pickup);
    if (!zone)
      throw new UnprocessableEntityException('Kaarx is not available at this pickup location yet');
    if (!(await this.zones.isWithinDestinationRadius(zone.zoneId, input.dropoff))) {
      throw new UnprocessableEntityException('This destination is too far for a Kaarx trip');
    }
    const rule = await this.findActiveRule(zone.cityId, input.bodyType);
    const route = await this.routing.route(input.pickup, input.dropoff);
    const breakdown = computeFare(toRuleInput(rule), { distanceM: route.distanceM, waitingS: 0 });
    return {
      cityId: zone.cityId,
      zoneId: zone.zoneId,
      pricingRuleId: rule.id,
      distanceM: route.distanceM,
      durationS: route.durationS,
      breakdown,
      driverEarningPaise: computeSettlement(breakdown.totalPaise, rule.platformCommissionPct)
        .driverEarningPaise,
    };
  }

  async findActiveRule(cityId: string, bodyType: BodyType): Promise<PricingRule> {
    const rule = await this.rules
      .createQueryBuilder('r')
      .where('r.cityId = :cityId', { cityId })
      .andWhere('(r.bodyType = :bodyType OR r.bodyType IS NULL)', { bodyType })
      .andWhere('r.effectiveFrom <= now()')
      .andWhere('(r.effectiveTo IS NULL OR r.effectiveTo > now())')
      .orderBy('r.bodyType', 'ASC', 'NULLS LAST')
      .addOrderBy('r.effectiveFrom', 'DESC')
      .getOne();
    if (!rule) throw new ServiceUnavailableException('Pricing is not configured for this city yet');
    return rule;
  }

  async getRule(id: string): Promise<PricingRule> {
    const rule = await this.rules.findOneBy({ id });
    if (!rule) throw new NotFoundException('Pricing rule not found');
    return rule;
  }

  async driverEarningFor(ruleId: string, farePaise: number): Promise<number> {
    const rule = await this.getRule(ruleId);
    return computeSettlement(farePaise, rule.platformCommissionPct).driverEarningPaise;
  }
}
