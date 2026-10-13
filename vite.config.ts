import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const firebaseApiKey =
    process.env.FIREBASEAPI ||
    env.FIREBASEAPI ||
    process.env.VITE_FIREBASEAPI ||
    env.VITE_FIREBASEAPI ||
    '';

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.FIREBASEAPI': JSON.stringify(firebaseApiKey),
      'import.meta.env.FIREBASEAPI': JSON.stringify(firebaseApiKey),
      'import.meta.env.VITE_FIREBASEAPI': JSON.stringify(firebaseApiKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
