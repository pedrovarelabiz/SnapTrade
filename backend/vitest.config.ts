import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Load environment variables from .env file for tests
config();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    exclude: [
      'node_modules/**',
      'dist/**',
      '**/node_modules/**',
      '**/*.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.config.ts',
        '**/types/**',
      ],
    },
  },
});
