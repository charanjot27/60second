import { log } from './log.js';

const chains = new Map();

export function enqueue(key, task) {
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(task).catch((err) => log.error('queue task failed', err));
  chains.set(key, next);
  next.then(() => {
    if (chains.get(key) === next) chains.delete(key);
  });
  return next;
}

export async function drain(timeoutMs = 10000) {
  const pending = Promise.allSettled([...chains.values()]);
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs).unref());
  await Promise.race([pending, timeout]);
}
