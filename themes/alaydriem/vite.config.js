/** @type {import('vite').UserConfig} */

import * as path from 'path';
import manifestSRI from 'vite-plugin-manifest-sri';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => ({
  base: command === 'build' ? '/' : '/',
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
        'main': path.resolve(__dirname, 'js/main.js'),
        'videos': path.resolve(__dirname, 'js/videos.js'),
      },
      output: {
        assetFileNames: 'assets/[name].[hash][extname]',
        chunkFileNames: 'js/chunk/[name].[hash].js',
        entryFileNames: 'js/[name].[hash].js',
      },
    },
  },
  server: {
    host: "0.0.0.0",
    watch: {
      include: [
        path.resolve(__dirname, "/js/**"),
        path.resolve(__dirname, "/scss/**"),
        path.resolve(__dirname, "/assets/**")
      ]
    }
  },
  plugins: [
    manifestSRI(),
    viteStaticCopy({
      targets: [{
        src: path.resolve(__dirname, "./../../static/manifest.json"),
        dest: path.resolve(__dirname, 'data')
      },
      {
        src: path.resolve(__dirname, "./assets/images/**"),
        dest: path.resolve(__dirname, "./../../static/assets/images/")
      }]
    })
  ],
}));