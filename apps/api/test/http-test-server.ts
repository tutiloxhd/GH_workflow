import type { AddressInfo } from 'node:net';
import type { Express } from 'express';

export const TEST_WEB_ORIGIN = 'http://localhost:4200';

export interface RunningServer {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export async function startServer(app: Express): Promise<RunningServer> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
