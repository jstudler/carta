/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { contentPlugin } from './tools/contentPlugin';
import { previewPlugin } from './tools/previewPlugin';

const commitHash = execSync('git rev-parse --short HEAD').toString().trim();

export default defineConfig({
  plugins: [react(), tailwindcss(), contentPlugin(), previewPlugin({ version: commitHash })],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
