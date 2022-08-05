/** @type {import('vite').UserConfig} */

import * as path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => ({
  base: command === 'build' ? '/etc.clientlibs/<project>/clientlibs/' : '/',
  publicDir: command === 'build' ? false : 'assets',

  build: {
    brotliSize: true,
    manifest: true,
    minify: 'terser',
    cssCodeSplit: true,
    outDir: '../../static',
    sourcemap: command === 'serve' ? 'inline' : false,
    rollupOptions: {
      input: {
        'main': path.resolve(__dirname, 'js/main.js')
      },
      output: {
        assetFileNames: 'assets/[ext]/[name][extname]',
        chunkFileNames: 'js/chunk/[name].[hash].js',
        entryFileNames: 'js/[name].js',
      },
    },
  },
  server: {
    host: "0.0.0.0",
    watch: {
        include: [
            path.resolve(__dirname, "/js/**"),
            path.resolve(__dirname, "/scss/**")
        ]
    }
  },
}));