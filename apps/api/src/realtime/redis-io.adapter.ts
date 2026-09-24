import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO over Redis pub/sub: an event emitted on any api replica reaches sockets
 * connected to every other replica. This is what lets two instances sit behind nginx.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connect(redisUrl: string) {
    const pub = new Redis(redisUrl);
    const sub = pub.duplicate();
    this.clients = [pub, sub];
    await Promise.all(this.clients.map((c) => (c.status === 'ready' ? Promise.resolve() : new Promise<void>((r) => c.once('ready', () => r())))));
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    // Websocket only: no long-polling, so nginx needs no sticky sessions.
    const server = super.createIOServer(port, { ...options, transports: ['websocket'] } as ServerOptions) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  override async close(server: Server) {
    await super.close(server);
    await Promise.all(this.clients.map((c) => c.quit().catch(() => undefined)));
  }
}
