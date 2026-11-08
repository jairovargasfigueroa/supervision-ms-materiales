import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Cada archivo levanta su propio MongoDB en memoria: de a uno, para no pedir varias bases
    // a la vez (cada mongod exige 500 MB libres en disco).
    fileParallelism: false,
  },
});
