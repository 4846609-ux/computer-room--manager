import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { tenantBranchRoom, type WsEnvelope, type WsEvent } from '@crm/shared';
import type { AppConfig } from '../config/configuration';

interface JwtPayload {
  sub: string;
  tenantId: string;
  branchIds: string[];
}

/**
 * Real-time gateway (namespace `/rt`). Clients authenticate with the access JWT and
 * are joined only to authorized tenant+branch rooms. Every emit is room-scoped so a
 * tenant/branch can never receive another's events.
 */
@WebSocketGateway({ namespace: '/rt', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        client.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) throw new Error('missing token');

      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get('jwt', { infer: true }).accessSecret,
      });

      // Join authorized branch rooms. Empty branchIds = all tenant branches; those
      // are joined lazily as the client subscribes to specific branches.
      client.data.tenantId = payload.tenantId;
      client.data.branchIds = payload.branchIds ?? [];
      for (const branchId of payload.branchIds ?? []) {
        await client.join(tenantBranchRoom(payload.tenantId, branchId));
      }
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`client disconnected: ${client.id}`);
  }

  /** Emit a tenant+branch-scoped event to authorized subscribers. */
  emitToBranch<T>(event: WsEvent, tenantId: string, branchId: string, payload: T): void {
    const envelope: WsEnvelope<T> = {
      event,
      tenantId,
      branchId,
      payload,
      emittedAt: new Date().toISOString(),
    };
    this.server.to(tenantBranchRoom(tenantId, branchId)).emit(event, envelope);
  }
}
