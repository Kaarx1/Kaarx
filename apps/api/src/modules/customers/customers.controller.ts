import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  emergencyContactsSchema,
  updateProfileSchema,
  vehicleSchema,
  type CustomerProfile,
  type EmergencyContactsInput,
  type UpdateProfileInput,
  type VehicleInput,
} from '@kaarx/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { EmergencyContactView, VehicleView } from './customer.views';
import { CustomersService } from './customers.service';

@Roles('customer')
@Controller('customer')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: AuthUser): Promise<CustomerProfile> {
    return this.customers.getProfile(user.id);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<CustomerProfile> {
    return this.customers.updateProfile(user.id, body);
  }

  @Get('vehicles')
  listVehicles(@CurrentUser() user: AuthUser): Promise<VehicleView[]> {
    return this.customers.listVehicles(user.id);
  }

  @Post('vehicles')
  addVehicle(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(vehicleSchema)) body: VehicleInput,
  ): Promise<VehicleView> {
    return this.customers.addVehicle(user.id, body);
  }

  @Put('vehicles/:id')
  replaceVehicle(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(vehicleSchema)) body: VehicleInput,
  ): Promise<VehicleView> {
    return this.customers.replaceVehicle(user.id, id, body);
  }

  @Delete('vehicles/:id')
  @HttpCode(204)
  removeVehicle(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.customers.removeVehicle(user.id, id);
  }

  @Post('vehicles/:id/default')
  @HttpCode(200)
  setDefaultVehicle(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VehicleView> {
    return this.customers.setDefaultVehicle(user.id, id);
  }

  @Get('emergency-contacts')
  getEmergencyContacts(
    @CurrentUser() user: AuthUser,
  ): Promise<{ contacts: EmergencyContactView[] }> {
    return this.customers.getEmergencyContacts(user.id);
  }

  @Put('emergency-contacts')
  replaceEmergencyContacts(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(emergencyContactsSchema)) body: EmergencyContactsInput,
  ): Promise<{ contacts: EmergencyContactView[] }> {
    return this.customers.replaceEmergencyContacts(user.id, body);
  }
}
