import { Injectable } from '@nestjs/common';
import type { BodyType } from '@kaarx/shared';
import { DataSource, EntityManager } from 'typeorm';
import { PricingRule } from '../entities';

@Injectable()
export class PricingRuleRepository {
  constructor(private readonly dataSource: DataSource) {}

  private repo(manager?: EntityManager) {
    return (manager ?? this.dataSource.manager).getRepository(PricingRule);
  }

  findById(id: string, manager?: EntityManager): Promise<PricingRule | null> {
    return this.repo(manager).findOneBy({ id });
  }

  findActive(
    cityId: string,
    bodyType: BodyType,
    manager?: EntityManager,
  ): Promise<PricingRule | null> {
    return this.repo(manager)
      .createQueryBuilder('r')
      .where('r.cityId = :cityId', { cityId })
      .andWhere('(r.bodyType = :bodyType OR r.bodyType IS NULL)', { bodyType })
      .andWhere('r.effectiveFrom <= now()')
      .andWhere('(r.effectiveTo IS NULL OR r.effectiveTo > now())')
      .orderBy('r.bodyType', 'ASC', 'NULLS LAST')
      .addOrderBy('r.effectiveFrom', 'DESC')
      .getOne();
  }
}
