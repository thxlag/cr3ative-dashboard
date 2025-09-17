const COLORS = {
  ok: '\u001b[32m',
  info: '\u001b[36m',
  warn: '\u001b[33m',
  error: '\u001b[31m'
};

const RESET = '\u001b[0m';

function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  const label = level.toUpperCase().padEnd(5);
  const content = typeof message === 'string' ? message : JSON.stringify(message);
  return `[${timestamp}] ${label} ${content}`;
}

function write(level, message, ...args) {
  const color = COLORS[level] ?? '';
  const formatted = formatMessage(level, message);
  const method = level === 'warn' ? console.warn : level === 'error' ? console.error : console.log;
  method(`${color}${formatted}${RESET}`, ...args);
}

export const log = {
  ok: (message, ...args) => write('ok', message, ...args),
  info: (message, ...args) => write('info', message, ...args),
  warn: (message, ...args) => write('warn', message, ...args),
  error: (message, ...args) => write('error', message, ...args)
};

export function createLogger(scope = '') {
  const prefix = scope ? `[${scope}]` : '';
  const withScope = (level, message, ...args) => {
    const content = prefix ? `${prefix} ${message}` : message;
    log[level](content, ...args);
  };

  return {
    ok: (message, ...args) => withScope('ok', message, ...args),
    info: (message, ...args) => withScope('info', message, ...args),
    warn: (message, ...args) => withScope('warn', message, ...args),
    error: (message, ...args) => withScope('error', message, ...args)
  };
}

export default log;