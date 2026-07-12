/**
 * Юнит-тесты (vitest): чистая логика src/lib + вынесенные модули edge-функций.
 * Запуск: npm run test:unit (или npx vitest для watch-режима).
 * E2E живут отдельно в tests/e2e (Playwright) — vitest их не трогает.
 */
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    // Playwright-спеки не подхватываем ни при каких настройках.
    exclude: ['tests/**', 'node_modules/**'],
  },
});
