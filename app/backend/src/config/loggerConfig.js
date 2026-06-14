// NODE_ENV=debug in local and should be kept empty in production
const loggerConfig = {
  level: process.env.NODE_ENV === 'debug' ? 'debug' : 'info',
  transport: process.env.NODE_ENV === 'debug'
    ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname',
        messageFormat: '{method} {url} - {msg}',
        singleLine: true,
      },
    }
    : undefined,
  base: process.env.NODE_ENV === 'debug' ? { pid: process.pid, hostname: true } : null,
};

export default loggerConfig;