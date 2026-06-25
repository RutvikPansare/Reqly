import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'packages/**/*.test.ts'],
    environment: 'node',
    // several test files (lock, switch-project, stop-command) read/write the
    // real ~/.reqly/running.json lock file - running files in parallel races on it
    fileParallelism: false,
  },
});
