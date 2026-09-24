import { HttpException, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { type Ack, ClientEvents, type Message, SendMessage } from '@nook/contracts';
import type { Server, Socket } from 'socket.io';
import { TokensService } from '../auth/tokens.service.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { MessagesService } from '../messages/messages.service.js';
import { PresenceService, RENEW_MS } from '../presence/presence.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService, rooms } from './realtime.service.js';

interface SocketData {
  userId: string;
  /** channelId → last relayed typing event, to throttle chatty clients. */
  typingAt?: Map<string, number>;
}

const TYPING_THROTTLE_MS = 2000;
type AuthedSocket = Socket<Record<string, never>, Record<string, (p: unknown) => void>, Record<string, never>, SocketData>;

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger('Realtime');
  private server?: Server;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly tokens: TokensService,
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly limiter: RateLimiter,
    private readonly presence: PresenceService,
  ) {}

  afterInit(server: Server) {
    this.server = server;
    this.realtime.bind(server);
    // Each replica renews the leases of its own sockets, and sweeps for replicas that died.
    this.timers.push(
      setInterval(() => void this.renewLocal().catch((e: unknown) => this.logger.error(String(e))), RENEW_MS),
      setInterval(() => void this.presence.sweep().catch((e: unknown) => this.logger.error(String(e))), RENEW_MS),
    );
    // Every connection must present a valid access token; the socket then acts as that user.
    server.use((socket, next) => {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token !== 'string') return next(new Error('unauthorized'));
      this.tokens.verifyAccess(token).then(
        (userId) => {
          (socket.data as SocketData).userId = userId;
          next();
        },
        () => next(new Error('unauthorized')),
      );
    });
  }

  async handleConnection(socket: AuthedSocket) {
    const userId = socket.data.userId;
    const [channels, nooks] = await Promise.all([
      this.prisma.channelMember.findMany({ where: { userId }, select: { channelId: true } }),
      this.prisma.nookMember.findMany({ where: { userId }, select: { nookId: true } }),
    ]);
    await socket.join([rooms.user(userId), ...channels.map((c) => rooms.channel(c.channelId)), ...nooks.map((n) => rooms.nook(n.nookId))]);
    await this.presence.connect(userId, socket.id);
    // The client's own "connect" fires before this handler finishes joining rooms; anything
    // emitted in between would be missed. "session:ready" marks the point from which it won't be.
    socket.emit('session:ready', { status: await this.presence.manualStatus(userId) });
  }

  async handleDisconnect(socket: AuthedSocket) {
    if (socket.data.userId) await this.presence.disconnect(socket.data.userId, socket.id);
  }

  onModuleDestroy() {
    for (const t of this.timers) clearInterval(t);
  }

  private async renewLocal() {
    const local = this.server?.of('/').sockets;
    if (!local) return;
    await this.presence.renew([...local.values()].map((s) => ({ userId: (s.data as SocketData).userId, socketId: s.id })));
  }

  @SubscribeMessage('presence:set')
  async setStatus(@ConnectedSocket() socket: AuthedSocket, @MessageBody() payload: unknown): Promise<Ack<null>> {
    const parsed = ClientEvents['presence:set'].safeParse(payload);
    if (!parsed.success) return { ok: false, error: 'Unknown status' };
    await this.presence.setManual(socket.data.userId, parsed.data.state);
    return { ok: true, data: null };
  }

  @SubscribeMessage('presence:idle')
  async setIdle(@ConnectedSocket() socket: AuthedSocket, @MessageBody() payload: unknown) {
    const parsed = ClientEvents['presence:idle'].safeParse(payload);
    if (parsed.success) await this.presence.setIdle(socket.data.userId, socket.id, parsed.data.idle);
  }

  /** Relays "typing" to the channel's other members on every replica. Membership = being in the room. */
  @SubscribeMessage('typing:start')
  typing(@ConnectedSocket() socket: AuthedSocket, @MessageBody() payload: unknown) {
    const parsed = ClientEvents['typing:start'].safeParse(payload);
    if (!parsed.success) return;
    const room = rooms.channel(parsed.data.channelId);
    if (!socket.rooms.has(room)) return;
    const typingAt = (socket.data.typingAt ??= new Map());
    const now = Date.now();
    if (now - (typingAt.get(room) ?? 0) < TYPING_THROTTLE_MS) return;
    typingAt.set(room, now);
    socket.to(room).emit('typing', { channelId: parsed.data.channelId, userId: socket.data.userId });
  }

  /** Returns the saved message as the ack; the broadcast to the channel happens in the service. */
  @SubscribeMessage('message:send')
  async send(@ConnectedSocket() socket: AuthedSocket, @MessageBody() payload: unknown): Promise<Ack<Message>> {
    const parsed = SendMessage.safeParse(payload);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid message' };
    try {
      await this.limiter.hit(`send:${socket.data.userId}`, 20, 10);
      return { ok: true, data: await this.messages.send(socket.data.userId, parsed.data) };
    } catch (err) {
      if (err instanceof HttpException) return { ok: false, error: err.message };
      this.logger.error(err instanceof Error ? err.stack : String(err));
      return { ok: false, error: 'Couldn’t send that. Try again.' };
    }
  }
}
