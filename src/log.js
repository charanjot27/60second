import crypto from 'node:crypto';

export function hashPhone(phone) {
  return crypto.createHash('sha256').update(String(phone)).digest('hex').slice(0, 16);
}

function write(level, msg, fields) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  info: (msg, fields = {}) => write('info', msg, fields),
  warn: (msg, fields = {}) => write('warn', msg, fields),
  error: (msg, err, fields = {}) =>
    write('error', msg, { ...fields, error: err?.message || String(err), stack: err?.stack }),
};
