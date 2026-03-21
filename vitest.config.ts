import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'dist/**',
        'src/cli.ts',
        'src/mcp-server.ts',
        'src/commands/init.ts',
        'src/commands/prune.ts',
        'src/core/types.ts',
        'src/core/middleware/index.ts',
        'src/setup/index.ts',
        'src/setup/postinstall.ts',
        'src/setup/preuninstall.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
