/** BullMQ queue names shared by the API (producer) and the worker (consumer). */
export const QUEUES = {
  jobs: 'nook-jobs',
} as const;

/** The worker refreshes this key while alive; health and the stack check read it. */
export const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';
export const WORKER_HEARTBEAT_TTL_S = 30;
