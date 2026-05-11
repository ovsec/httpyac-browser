import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, renameSync, rmSync } from 'fs';

function copyAssetsPlugin() {
  return {
    name: 'copy-assets',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');

      // Flatten: src/popup.html → popup.html at dist root
      const nestedHtml = resolve(dist, 'src/popup.html');
      if (existsSync(nestedHtml)) {
        renameSync(nestedHtml, resolve(dist, 'popup.html'));
        // Remove empty dist/src directory
        const srcDir = resolve(dist, 'src');
        if (existsSync(srcDir)) {
          rmSync(srcDir, { recursive: true, force: true });
        }
      }

      // Copy non-bundled assets
      const assets = ['manifest.json', 'icons', 'PRIVACY.md', 'README.md'];
      for (const asset of assets) {
        const src = resolve(__dirname, asset);
        if (!existsSync(src)) continue;
        const dst = resolve(dist, asset);
        if (statSync(src).isDirectory()) {
          if (!existsSync(dst)) mkdirSync(dst, { recursive: true });
          for (const f of readdirSync(src)) {
            copyFileSync(resolve(src, f), resolve(dst, f));
          }
        } else {
          copyFileSync(src, dst);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [copyAssetsPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.ts'),
        background: resolve(__dirname, 'src/background/index.ts'),
        popup: resolve(__dirname, 'src/popup.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
