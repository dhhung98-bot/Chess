import { defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'chess-endgame-web',
    compatibilityDate: '2026-11-28',
    workersDev: true,
    previewUrls: false,
  },
});
