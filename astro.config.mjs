// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// `site` is the production origin; swap it in src/data/site.ts (meta.url) and here once the domain is known.
// React only powers the two WebGL canvases (src/three/*), mounted by motion.ts via dynamic import():
// no `client:*` islands, so the HTML sections ship zero React runtime. Without islands, @astrojs/react's
// Fast Refresh preamble is never injected (dev throws), so the .tsx files compile with esbuild's
// automatic JSX runtime instead; the r3f code is plain React 19 either way.
export default defineConfig({
  site: 'https://velonlabs.in',
  trailingSlash: 'ignore',
  prefetch: false,
  devToolbar: { enabled: false },
  output: 'static',
  // POST /api/contact is the only dynamic route (export const prerender = false there);
  // every other page stays static. The serverless adapter lets Vercel run that one route
  // as a function while the rest of the build is plain static output.
  adapter: vercel(),
  integrations: [sitemap()],
  server: { port: 3950, host: 'localhost' },
  build: { inlineStylesheets: 'auto' },
  // strictPort lives on the Vite server: fail instead of drifting to another port
  vite: {
    server: { strictPort: true },
    preview: { strictPort: true },
    resolve: { dedupe: ['three', 'react', 'react-dom'] },
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
    build: {
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 2600,
      // readable lazy chunks: three-*.js (three + r3f, shared by both canvases), rapier-*.js (badge physics only)
      rollupOptions: {
        output: {
          manualChunks(id) {
            // vite's preload helper and commonjs shims stay out of the lazy 3D chunks (else Base imports them eagerly)
            if (id.includes('vite/preload-helper')) return 'rt';
            if (/node_modules\/(@dimforge|@react-three\/rapier)/.test(id)) return 'rapier';
            if (/node_modules\/(three|@react-three\/fiber|react|react-dom|scheduler|its-fine|zustand|suspend-react|react-use-measure)\//.test(id) || /^\0.*(react|scheduler)/.test(id)) return 'three';
          },
        },
      },
    },
  },
});
