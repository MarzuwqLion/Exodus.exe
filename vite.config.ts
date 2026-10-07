import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * Exposes the list of optional audio override files (public/audio/<cue>.mp3|.ogg) as a virtual module,
 * so the game only requests files that exist and never logs a 404 (spec 14.3).
 */
function audioOverrides(): Plugin {
  const id = 'virtual:audio-overrides';
  const resolvedId = '\0' + id;
  return {
    name: 'exodus-audio-overrides',
    resolveId(source) {
      return source === id ? resolvedId : null;
    },
    load(loadId) {
      if (loadId !== resolvedId) return null;
      const dir = fileURLToPath(new URL('./public/audio', import.meta.url));
      const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(mp3|ogg)$/i.test(f)) : [];
      return `export default ${JSON.stringify(files.sort())};`;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [audioOverrides()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2500,
    reportCompressedSize: true,
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: false },
});
