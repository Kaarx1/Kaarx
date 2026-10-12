import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import { REALTIME_EVENTS } from '@kaarx/shared';
import type { Socket } from 'socket.io';
import { SESSION_EXPIRED, verifyAccessToken, type AuthUser } from '../../common/auth/auth-user';
import { ADMINS_ROOM, customerRoom, driverRoom } from './realtime.publisher';

function roomFor(user: AuthUser): string {
  if (user.role === 'admin') return ADMINS_ROOM;
  if (user.role === 'driver') return driverRoom(user.id);
  return customerRoom(user.id);
}

@WebSocketGateway({ cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection {
  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    const user = await this.verify(client.handshake.auth['token']);
    if (!user) {
      client.emit(REALTIME_EVENTS.authError, { message: SESSION_EXPIRED });
      client.disconnect(true);
      return;
    }
    await client.join(roomFor(user));
    client.emit(REALTIME_EVENTS.ready, { role: user.role });
  }

  private async verify(token: unknown): Promise<AuthUser | null> {
    if (typeof token !== 'string' || token.length === 0) return null;
    try {
      return await verifyAccessToken(this.jwt, token);
    } catch {
      return null;
    }
  }
}
