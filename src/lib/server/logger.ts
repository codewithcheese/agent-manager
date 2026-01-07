/**
 * Simple logger for server-side logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'debug';

function shouldLog(level: LogLevel): boolean {
	return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, module: string, message: string, data?: unknown): string {
	const timestamp = new Date().toISOString();
	const prefix = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;
	if (data !== undefined) {
		return `${prefix} ${message} ${JSON.stringify(data, null, 2)}`;
	}
	return `${prefix} ${message}`;
}

export function createLogger(module: string) {
	return {
		debug(message: string, data?: unknown) {
			if (shouldLog('debug')) {
				console.log(formatMessage('debug', module, message, data));
			}
		},
		info(message: string, data?: unknown) {
			if (shouldLog('info')) {
				console.log(formatMessage('info', module, message, data));
			}
		},
		warn(message: string, data?: unknown) {
			if (shouldLog('warn')) {
				console.warn(formatMessage('warn', module, message, data));
			}
		},
		error(message: string, error?: unknown) {
			if (shouldLog('error')) {
				if (error instanceof Error) {
					console.error(formatMessage('error', module, message, { message: error.message, stack: error.stack }));
				} else {
					console.error(formatMessage('error', module, message, error));
				}
			}
		}
	};
}
