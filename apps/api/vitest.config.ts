import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Las pruebas de integración comparten una base: se ejecutan archivo por archivo.
    fileParallelism: false,
  },
});
