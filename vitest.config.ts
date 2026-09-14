import { defineConfig } from 'vitest/config';
// npm test disables Maglev for the measured Windows26200 native crash (nodejs/node#62260).
export default defineConfig({test:{pool:'forks',forks:{execArgv:['--no-maglev']},fileParallelism:false,testTimeout:65000,hookTimeout:45000,include:['apps/web/tests/**/*.test.ts','apps/web/src/components/**/*.test.ts']}});
