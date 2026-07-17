import { defineConfig } from 'vitest/config';

// Unit tests live in tests/; e2e/*.spec.ts belongs to Playwright and must not
// be collected by vitest.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts']
  }
});
