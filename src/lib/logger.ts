/**
 * Logger mínimo — wrapper em console com prefixo de severidade.
 * Mantém forma consistente para grep nos logs do Coolify.
 */
type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
    const line = ctx ? `${msg} ${JSON.stringify(ctx)}` : msg;
    const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    out(`[${level}] ${line}`);
}

export const logger = {
    info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
};
