import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Serves the Vercel serverless function in /api/gemini.ts during `npm run dev`,
 * so the AI shoutcaster works locally without the Vercel CLI.
 * In production Vercel runs the same file as an Edge Function.
 */
function devApi(): Plugin {
  return {
    name: 'tcc-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/gemini', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/api/gemini.ts');
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const headers = new Headers();
          if (req.headers['content-type']) headers.set('content-type', String(req.headers['content-type']));
          if (req.headers.authorization) headers.set('authorization', String(req.headers.authorization));
          const request = new Request(`http://localhost/api/gemini`, {
            method: req.method,
            headers,
            body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          });
          const response: Response = await mod.default(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Expose server-only secrets (GEMINI_*) to the dev API middleware via process.env.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_TTS_MODEL', 'GEMINI_THINKING_BUDGET', 'VITE_FIREBASE_PROJECT_ID']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    // Fixed port on IPv4 so OBS (Chromium 103) and browsers always reach THIS
    // app. On Windows, another Vite project on 0.0.0.0:5173 can silently share
    // the "same" port with one on [::1]:5173 — OBS then loads the wrong app.
    // strictPort: fail loudly instead of drifting to another port.
    server: { host: '127.0.0.1', port: 5180, strictPort: true },
    preview: { host: '127.0.0.1', port: 5181, strictPort: true },
    plugins: [react(), devApi()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            motion: ['framer-motion'],
          },
        },
      },
    },
  };
});
