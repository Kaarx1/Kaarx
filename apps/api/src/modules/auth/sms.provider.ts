import { Logger, ServiceUnavailableException } from '@nestjs/common';

const SMS_UNAVAILABLE = 'We could not send the code. Try again in a minute.';

export abstract class SmsProvider {
  abstract sendOtp(phone: string, code: string): Promise<void>;
}

export class ConsoleSmsProvider extends SmsProvider {
  private readonly logger = new Logger('ConsoleSms');

  async sendOtp(phone: string, code: string): Promise<void> {
    this.logger.debug(`OTP for ${phone}: ${code}`);
  }
}

export class Msg91SmsProvider extends SmsProvider {
  private readonly logger = new Logger('Msg91Sms');

  constructor(
    private readonly authKey: string,
    private readonly templateId: string,
  ) {
    super();
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('template_id', this.templateId);
    url.searchParams.set('mobile', phone.replace(/^\+/, ''));
    url.searchParams.set('otp', code);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { authkey: this.authKey },
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      this.logger.error(`MSG91 request failed: ${String(error)}`);
      throw new ServiceUnavailableException(SMS_UNAVAILABLE);
    }
    if (!response.ok) {
      this.logger.error(`MSG91 responded ${response.status}: ${await response.text()}`);
      throw new ServiceUnavailableException(SMS_UNAVAILABLE);
    }
  }
}
