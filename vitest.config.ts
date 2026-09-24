import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Dedicated test config, kept separate from vite.config.ts so the Laravel and
// Wayfinder plugins don't run during tests. jsdom so React hook and component
// tests can mount; the pure-logic suites are unaffected by it. The '@' alias
// mirrors the tsconfig path so test imports match app imports.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./resources/js/test/setup.ts'],
    include: ['resources/js/**/*.test.{ts,tsx}'],
  },
});
