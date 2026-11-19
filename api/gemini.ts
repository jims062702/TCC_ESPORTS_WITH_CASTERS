// ─────────────────────────────────────────────────────────────────────────────
// POST /api/gemini — server-side proxy to the Gemini API (Vercel Edge Function,
// free on the Hobby plan). Keeps GEMINI_API_KEY off the client and only serves
// signed-in TCC admins, so nobody can drain the free quota from the public site.
//
// Admin check without a service account: we call the Firestore REST API with
// the caller's own Firebase ID token. Firestore validates the token and the
// security rules only let a user read admins/{theirUid} — so a 200 response
// proves "valid token AND admin".
// ─────────────────────────────────────────────────────────────────────────────

export const config = { runtime: 'edge' };

const MAX_INPUT_CHARS = 16000;
const verifiedTokens = new Map<string, number>(); // token → expiry (ms), per instance

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function decodeJwtPayload(token: string): { user_id?: string; sub?: string; exp?: number } | null {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

async function isAdminToken(token: string): Promise<boolean> {
  const cached = verifiedTokens.get(token);
  if (cached && cached > Date.now()) return true;
  const payload = decodeJwtPayload(token);
  const uid = payload?.user_id ?? payload?.sub;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;
  if (!uid || !projectId || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return false;
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/admins/${uid}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return false;
  const exp = (payload?.exp ?? 0) * 1000;
  verifiedTokens.set(token, Math.min(exp || Date.now() + 5 * 60_000, Date.now() + 10 * 60_000));
  if (verifiedTokens.size > 200) verifiedTokens.clear();
  return true;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    lines: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          caster: { type: 'STRING' },
          text: { type: 'STRING' },
        },
        required: ['caster', 'text'],
      },
    },
  },
  required: ['lines'],
};

const LIBRARY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    entries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          key: { type: 'STRING' },
          lead: { type: 'STRING' },
          follow: { type: 'STRING' },
        },
        required: ['key', 'lead', 'follow'],
      },
    },
  },
  required: ['entries'],
};

const clean = (s: string) =>
  s
    .replace(/[*#`]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

// ── Text-to-speech (realistic caster voices) ─────────────────────────────────
// One request voices a whole exchange: Gemini's multi-speaker TTS performs up
// to two casters in a single clip, so they take turns naturally. Returns raw
// 16-bit PCM (base64) that the Caster Booth plays with the Web Audio API.

const SPEAKER = /^[A-Za-z][A-Za-z0-9]{0,23}$/;
const VOICE = /^[A-Za-z]{2,24}$/;

async function synthesize(
  apiKey: string,
  body: { lines?: { speaker?: string; text?: string }[]; voices?: Record<string, string>; direction?: string },
): Promise<Response> {
  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .slice(0, 4)
    .map((l) => ({ speaker: String(l?.speaker ?? ''), text: clean(String(l?.text ?? '')) }))
    .filter((l) => SPEAKER.test(l.speaker) && l.text);
  if (!lines.length) return json(400, { error: 'No lines to speak' });
  const speakers = [...new Set(lines.map((l) => l.speaker))];
  if (speakers.length > 2) return json(400, { error: 'At most two speakers per clip' });
  const voices = body.voices ?? {};
  for (const s of speakers) if (!VOICE.test(String(voices[s] ?? ''))) return json(400, { error: `Missing voice for ${s}` });
  const direction = String(body.direction ?? '').slice(0, 2500);

  const speechConfig =
    speakers.length === 2
      ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakers.map((s) => ({ speaker: s, voiceConfig: { prebuiltVoiceConfig: { voiceName: voices[s] } } })) } }
      : { voiceConfig: { prebuiltVoiceConfig: { voiceName: voices[speakers[0]] } } };
  const script = lines.map((l) => `${l.speaker}: ${l.text}`).join('\n');
  const prompt = `${direction}\n\nTTS the following live broadcast exchange between ${speakers.join(' and ')}:\n${script}`;

  const model = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig },
    }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    const retry = upstream.headers.get('retry-after');
    return json(upstream.status === 429 ? 429 : 502, {
      error: upstream.status === 429 ? 'Gemini voice quota reached' : `Gemini TTS error ${upstream.status}`,
      retryAfterSec: retry ? Number(retry) : undefined,
      detail: detail.slice(0, 500),
    });
  }
  const data = await upstream.json();
  const part = (data?.candidates?.[0]?.content?.parts ?? []).find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
  if (!part) return json(502, { error: 'Gemini returned no audio' });
  const mimeType: string = part.inlineData.mimeType ?? 'audio/L16;codec=pcm;rate=24000';
  const sampleRate = Number(/rate=(\d+)/.exec(mimeType)?.[1] ?? 24000);
  return json(200, { audio: part.inlineData.data, mimeType, sampleRate, model, speakers });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(503, { error: 'GEMINI_API_KEY is not set on the server.' });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Missing auth token' });
  if (!(await isAdminToken(token))) return json(403, { error: 'Admins only' });

  let body: {
    mode?: string;
    system?: string;
    prompt?: string;
    casters?: string[];
    keys?: string[];
    lines?: { speaker?: string; text?: string }[];
    voices?: Record<string, string>;
    direction?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  if (body.mode === 'tts') return synthesize(apiKey, body);
  const mode = body.mode === 'library' ? 'library' : 'lines';
  const system = String(body.system ?? '');
  const prompt = String(body.prompt ?? '');
  const casters = Array.isArray(body.casters) ? body.casters.map(String).slice(0, 2) : [];
  const keys = Array.isArray(body.keys) ? body.keys.map(String).slice(0, 40) : [];
  if (!prompt || system.length + prompt.length > MAX_INPUT_CHARS) return json(400, { error: 'Prompt missing or too long' });

  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const generationConfig: Record<string, unknown> = {
    temperature: mode === 'library' ? 1.0 : 0.95,
    topP: 0.95,
    maxOutputTokens: mode === 'library' ? 8192 : 2048,
    responseMimeType: 'application/json',
    responseSchema: mode === 'library' ? LIBRARY_SCHEMA : RESPONSE_SCHEMA,
  };
  const budget = process.env.GEMINI_THINKING_BUDGET;
  if (budget !== undefined && budget !== '') generationConfig.thinkingConfig = { thinkingBudget: Number(budget) };

  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    const retry = upstream.headers.get('retry-after');
    return json(upstream.status === 429 ? 429 : 502, {
      error: upstream.status === 429 ? 'Gemini rate limit reached' : `Gemini error ${upstream.status}`,
      retryAfterSec: retry ? Number(retry) : undefined,
      detail: detail.slice(0, 500),
    });
  }

  const data = await upstream.json();
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string; thought?: boolean }) => (p.thought ? '' : (p.text ?? '')))
    .join('');
  let parsed: { lines?: unknown; entries?: unknown };
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim());
  } catch {
    return json(502, { error: 'Gemini returned malformed JSON' });
  }

  if (mode === 'library') {
    const entries = (Array.isArray(parsed?.entries) ? parsed.entries : [])
      .filter((e: { key?: unknown; lead?: unknown; follow?: unknown }) => e && typeof e.lead === 'string' && typeof e.follow === 'string' && keys.includes(String(e.key)))
      .slice(0, 400)
      .map((e: { key: string; lead: string; follow: string }) => ({ key: e.key, lead: clean(e.lead), follow: clean(e.follow) }))
      .filter((e: { lead: string; follow: string }) => e.lead && e.follow);
    return json(200, { entries, model, usage: data?.usageMetadata ?? null });
  }

  const lines: { caster: string; text: string }[] = Array.isArray(parsed?.lines) ? (parsed.lines as { caster: string; text: string }[]) : [];

  // Keep only the seated casters, alternate if the model mislabels anyone.
  const out = lines
    .filter((l) => l && typeof l.text === 'string' && clean(l.text).length > 0)
    .slice(0, 4)
    .map((l, i) => ({
      caster: casters.includes(l.caster) ? l.caster : (casters[i % Math.max(1, casters.length)] ?? l.caster),
      text: clean(l.text),
    }));

  return json(200, { lines: out, model, usage: data?.usageMetadata ?? null });
}
