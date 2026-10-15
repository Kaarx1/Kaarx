import { Body, Controller, Post } from '@nestjs/common';
import { sosSchema, type SosInput } from '@kaarx/shared';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ZodValidationPipe } from '../../../common/zod-validation.pipe';
import { SafetyService } from '../services/safety.service';

@Controller('sos')
@Roles('customer', 'driver')
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post()
  raise(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(sosSchema)) body: SosInput,
  ): Promise<{ id: string }> {
    return this.safety.raise(user, body);
  }
}
