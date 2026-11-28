import { bindings, defineConfig } from 'cf/config';

const localOrigin = 'http://localhost:4173';
export default defineConfig({
  worker: {
    name: 'chess-endgame-api',
    entrypoint: './src/index.mjs',
    compatibilityDate: '2026-11-28',
    workersDev: true,
    previewUrls: false,
    env: {
      DB: bindings.d1({ id: process.env.CHESS_D1_ID || '00000000-0000-4000-8000-000000000000' }),
      FRONTEND_ORIGIN: bindings.text(process.env.CHESS_FRONTEND_URL || localOrigin),
    },
  },
});
