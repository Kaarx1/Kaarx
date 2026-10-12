import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  adminDriversQuerySchema,
  createDriverSchema,
  driverDocumentSchema,
  driverOnboardingSchema,
  suspendDriverSchema,
  type AdminDriversQuery,
  type CreateDriverInput,
  type DriverDocumentInput,
  type DriverOnboardingInput,
  type SuspendDriverInput,
} from '@kaarx/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { AdminRoles, CurrentUser, Roles } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { Driver, DriverDocument } from '../../database/entities';
import { DriversService } from './drivers.service';

@Roles('admin')
@Controller('admin/drivers')
export class AdminDriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminDriversQuerySchema)) query: AdminDriversQuery,
  ): Promise<Driver[]> {
    return this.drivers.list(query);
  }

  @Post()
  @AdminRoles('ops_manager', 'verification_agent')
  create(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodValidationPipe(createDriverSchema)) body: CreateDriverInput,
  ): Promise<Driver> {
    return this.drivers.create(body, admin.id);
  }

  @Get(':id')
  getDetail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ driver: Driver; documents: DriverDocument[] }> {
    return this.drivers.getDetail(id);
  }

  @Post(':id/documents')
  @AdminRoles('verification_agent', 'ops_manager')
  addDocument(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(driverDocumentSchema)) body: DriverDocumentInput,
  ): Promise<DriverDocument> {
    return this.drivers.addDocument(id, body, admin.id);
  }

  @Patch(':id/onboarding')
  @AdminRoles('verification_agent', 'ops_manager')
  updateOnboarding(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(driverOnboardingSchema)) body: DriverOnboardingInput,
  ): Promise<Driver> {
    return this.drivers.updateOnboarding(id, body, admin.id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @AdminRoles('verification_agent', 'ops_manager')
  approve(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Driver> {
    return this.drivers.approve(id, admin.id);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @AdminRoles('ops_manager')
  suspend(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(suspendDriverSchema)) body: SuspendDriverInput,
  ): Promise<Driver> {
    return this.drivers.suspend(id, body, admin.id);
  }

  @Post(':id/reinstate')
  @HttpCode(200)
  @AdminRoles('ops_manager')
  reinstate(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Driver> {
    return this.drivers.reinstate(id, admin.id);
  }
}
