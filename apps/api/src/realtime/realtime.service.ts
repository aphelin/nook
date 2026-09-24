import { type BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import type { ServerEventName, ServerEventPayload } from '@nook/contracts';
/**
 * Anything that can emit into rooms: the Socket.IO server in the api, or a Redis emitter in the
 * worker (which has no sockets of its own but can still reach every client through Redis).
 */
interface RoomTarget {
  to(room: string | string[]): { emit(event: string, ...args: unknown[]): unknown };
  in(room: string | string[]): { socketsJoin(room: string | string[]): unknown };
}

export const rooms = {
  user: (id: string) => `user:${id}`,
  channel: (id: string) => `channel:${id}`,
  nook: (id: string) => `nook:${id}`,
};

/**
 * The only way the rest of the api talks to sockets. Every call goes through the
 * Redis adapter, so it reaches the right sockets on every replica.
 */
@Injectable()
export class RealtimeService implements BeforeApplicationShutdown {
  private server?: RoomTarget;
  private closing = false;

  bind(server: RoomTarget) {
    this.server = server;
  }

  /**
   * Runs before Nest closes the socket server. From here on this replica stops broadcasting:
   * its sockets' leases lapse and the sweeper on the surviving replicas announces them offline.
   */
  beforeApplicationShutdown() {
    this.closing = true;
  }

  emit<E extends ServerEventName>(room: string | string[], event: E, payload: ServerEventPayload<E>) {
    if (this.closing) return;
    this.server?.to(room).emit(event, payload);
  }

  /** Subscribes all of a user's live sockets (on any replica) to more rooms. */
  join(userIds: string[], room: string | string[]) {
    if (!this.server || this.closing || userIds.length === 0) return;
    this.server.in(userIds.map(rooms.user)).socketsJoin(room);
  }
}
