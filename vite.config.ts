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

/**
 * Instant-replay files on THIS computer (local `npm run dev` only): OBS saves
 * each replay to its recording folder; the controller and the break overlay
 * read it from here — no browser folder permission needed. Only video files,
 * only for requests from this computer.
 */
function localReplayFiles(): Plugin {
  const TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.flv': 'video/x-flv', '.ts': 'video/mp2t' };
  return {
    name: 'tcc-local-replays',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__replay-file', async (req, res) => {
        const { default: fs } = await import('node:fs');
        const { default: path } = await import('node:path');
        const remote = req.socket.remoteAddress ?? '';
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
          res.statusCode = 403;
          return res.end('Local replays are only served to this computer');
        }
        const raw = new URL(req.url ?? '', 'http://local').searchParams.get('path') ?? '';
        const file = path.normalize(raw);
        const type = TYPES[path.extname(file).toLowerCase()];
        if (!raw || !path.isAbsolute(file) || !type || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          return res.end('Replay not found');
        }
        const size = fs.statSync(file).size;
        res.setHeader('Content-Type', type);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        if (req.method === 'HEAD') {
          res.setHeader('Content-Length', String(size));
          return res.end();
        }
        // Range requests so the <video> on the break screen can stream/seek.
        const m = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range ?? ''));
        if (m) {
          const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
          const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', String(end - start + 1));
          return fs.createReadStream(file, { start, end }).pipe(res);
        }
        res.setHeader('Content-Length', String(size));
        fs.createReadStream(file).pipe(res);
      });
      // Replays already saved in OBS's recording folder (newest first).
      server.middlewares.use('/__replay-list', async (req, res) => {
        const { default: fs } = await import('node:fs');
        const { default: path } = await import('node:path');
        const remote = req.socket.remoteAddress ?? '';
        res.setHeader('Content-Type', 'application/json');
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
          res.statusCode = 403;
          return res.end('[]');
        }
        const dir = path.normalize(new URL(req.url ?? '', 'http://local').searchParams.get('dir') ?? '');
        if (!dir || !path.isAbsolute(dir) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
          res.statusCode = 404;
          return res.end('[]');
        }
        const files = fs
          .readdirSync(dir)
          .filter((n) => TYPES[path.extname(n).toLowerCase()])
          .map((n) => {
            const full = path.join(dir, n);
            const st = fs.statSync(full);
            return { path: full, name: n, mtime: st.mtimeMs, size: st.size };
          })
          .filter((f) => f.size > 0)
          .sort((a, b) => b.mtime - a.mtime)
          .slice(0, 30);
        res.end(JSON.stringify(files));
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
    plugins: [react(), devApi(), localReplayFiles()],
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
