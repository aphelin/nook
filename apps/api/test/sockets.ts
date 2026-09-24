import type { ServerEventName } from '@nook/contracts';
import { io, type Socket } from 'socket.io-client';

const opened: Socket[] = [];

export function connect(url: string, token: string | null): Promise<Socket> {
  const socket = io(url, { transports: ['websocket'], auth: token ? { token } : {}, reconnection: false, forceNew: true });
  opened.push(socket);
  // Wait for the server's "ready", not just the transport: until then the socket isn't in its rooms.
  return new Promise((resolve, reject) => {
    socket.once('session:ready', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

export function closeAll() {
  for (const s of opened.splice(0)) s.disconnect();
}

/** Resolves with the next matching event, or rejects after a timeout. */
export function nextEvent<T>(socket: Socket, event: ServerEventName, match: (p: T) => boolean = () => true, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, ms);
    const handler = (payload: T) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

/** Collects every matching event for a while, to prove something did NOT arrive (or arrived once). */
export function collect<T>(socket: Socket, event: ServerEventName, match: (p: T) => boolean = () => true, ms = 400): Promise<T[]> {
  const seen: T[] = [];
  const handler = (p: T) => {
    if (match(p)) seen.push(p);
  };
  socket.on(event, handler);
  return new Promise((resolve) =>
    setTimeout(() => {
      socket.off(event, handler);
      resolve(seen);
    }, ms),
  );
}
