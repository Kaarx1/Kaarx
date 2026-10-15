import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { handleSosSchema, type HandleSosInput, type SosAdminView } from '@kaarx/shared';
import type { AuthUser } from '../../../common/auth/auth-user';
import { AdminRoles, CurrentUser, Roles } from '../../../common/auth/decorators';
import { ZodValidationPipe } from '../../../common/zod-validation.pipe';
import { SafetyService } from '../services/safety.service';

@Controller('admin/sos')
@Roles('admin')
export class AdminSosController {
  constructor(private readonly safety: SafetyService) {}

  @Get()
  listOpen(): Promise<SosAdminView[]> {
    return this.safety.listOpen();
  }

  @Post(':id/handle')
  @HttpCode(200)
  @AdminRoles('ops_manager', 'support_agent')
  handle(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(handleSosSchema)) body: HandleSosInput,
  ): Promise<SosAdminView> {
    return this.safety.handle(admin, id, body.notes);
  }
}
