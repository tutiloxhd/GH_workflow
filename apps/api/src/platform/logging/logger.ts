// Logger estructurado mínimo (una línea JSON por evento). Nunca recibe secretos ni datos personales.
type LogContext = Record<string, string | number | boolean | null | undefined>;

function write(stream: NodeJS.WriteStream, level: string, event: string, context: LogContext) {
  stream.write(`${JSON.stringify({ time: new Date().toISOString(), level, event, ...context })}\n`);
}

export const logger = {
  info(event: string, context: LogContext = {}): void {
    write(process.stdout, 'info', event, context);
  },
  error(event: string, error: unknown, context: LogContext = {}): void {
    const errorName = error instanceof Error ? error.name : typeof error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    write(process.stderr, 'error', event, { ...context, errorName, errorMessage });
  },
};
