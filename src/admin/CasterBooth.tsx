import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Bot, Mic2, Power, Shuffle, Sparkles, Trash2, Volume2, Wand2 } from 'lucide-react';
import type { ScriptLibrary } from '@/types';
import { useDocData, useLive, useSettings } from '@/hooks/useFirestore';
import { COL } from '@/services/firebase';
import {
  CommentaryEngine,
  DEFAULT_ENGINE_SETTINGS,
  SCRIPT_DOC,
  aiUsageToday,
  clearLibrary,
  pregenerateLibrary,
  type EngineLogEntry,
  type EngineSettings,
  type EngineStatus,
} from '@/services/commentary';
import { CASTERS, CASTER_BY_ID, autoAssignVoices, loadVoices, speechSupported, type CasterId } from '@/services/casters';
import { GEMINI_VOICES, TTS_PROFILE, loadGeminiVoices, saveGeminiVoices, ttsUsageToday } from '@/services/tts';
import { rerollCasters } from '@/services/live';
import { SCRIPT_KEYS, builtinCount, eventPairCount } from '@/services/templates';
import { LineLibrary } from './LineLibrary';
import { STORAGE_KEYS } from '@/lib/constants';
import { cn, safeLocalGet, safeLocalSet } from '@/lib/utils';
import { CasterAvatar } from '@/components/Brand';
import { Badge, Button, Card, Field, Input, Notice, Select, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';

const VOICE_ENGINES = [
  { v: 'gemini', title: 'Realistic', desc: 'Original Gemini voices performing like live casters (emotion, hype, Taglish). Uses Gemini quota.' },
  { v: 'browser', title: 'Basic', desc: 'Free, unlimited browser voices. Sounds robotic.' },
] as const;

export default function CasterBooth() {
  const toast = useToast();
  const live = useLive();
  const settingsDoc = useSettings();
  const library = useDocData<ScriptLibrary>(COL.scripts, SCRIPT_DOC);
  const [settings, setSettings] = useState<EngineSettings>(() => safeLocalGet(STORAGE_KEYS.boothSettings, DEFAULT_ENGINE_SETTINGS));
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceMap, setVoiceMap] = useState<Record<string, string | null>>(() => safeLocalGet(STORAGE_KEYS.boothVoices, {} as Record<string, string | null>));
  const [geminiVoices, setGeminiVoices] = useState<Record<string, string>>(loadGeminiVoices);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [log, setLog] = useState<EngineLogEntry[]>([]);
  const [perKey, setPerKey] = useState(6);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);
  const engineRef = useRef<CommentaryEngine | null>(null);

  // One engine per booth page; always stopped on unmount (no orphan listeners or speech).
  if (!engineRef.current) {
    engineRef.current = new CommentaryEngine({
      onLog: (e) => setLog((xs) => [e, ...xs].slice(0, 40)),
      onStatus: setStatus,
    });
  }
  const engine = engineRef.current;
  useEffect(() => () => engine.stop(), [engine]);

  useEffect(() => {
    let cancelled = false;
    void loadVoices().then((vs) => {
      if (cancelled) return;
      setVoices(vs);
      setVoiceMap((current) => {
        const auto = autoAssignVoices(vs);
        const merged = { ...auto } as Record<string, string | null>;
        for (const [k, v] of Object.entries(current)) if (v && vs.some((x) => x.voiceURI === v)) merged[k] = v;
        return merged;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    engine.setSettings(settings);
    safeLocalSet(STORAGE_KEYS.boothSettings, settings);
  }, [engine, settings]);

  useEffect(() => {
    engine.setVoices(voices, voiceMap);
    safeLocalSet(STORAGE_KEYS.boothVoices, voiceMap);
  }, [engine, voices, voiceMap]);

  useEffect(() => {
    engine.setGeminiVoices(geminiVoices);
    saveGeminiVoices(geminiVoices);
  }, [engine, geminiVoices]);
  const realistic = settings.voiceEngine === 'gemini';

  const running = status?.running ?? false;
  const profiles = settingsDoc.data.casterProfiles;
  const seated = live.data.casters;
  const aiEntries = library.data?.entries?.length ?? 0;
  const isEdge = /Edg\//.test(navigator.userAgent);

  const byKey = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of library.data?.entries ?? []) m[e.key] = (m[e.key] ?? 0) + 1;
    return m;
  }, [library.data]);

  const set = <K extends keyof EngineSettings>(k: K, v: EngineSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  const generate = async () => {
    const calls = Math.ceil(SCRIPT_KEYS.length / 5);
    if (!confirm(`Pre-generate ~${perKey * SCRIPT_KEYS.length} shoutcast lines with ${calls} Gemini calls? They are saved and reused for the whole tournament.`)) return;
    setGenProgress({ done: 0, total: calls });
    const added = await toast.run(() => pregenerateLibrary(perKey, (done, total) => setGenProgress({ done, total })));
    setGenProgress(null);
    if (added !== undefined) toast.success(`Added ${added} new pre-shoutcast lines`);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">AI Taglish shoutcasters</p>
          <h1 className="section-title">Caster Booth</h1>
          <Link to="/guide#casters" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
            How to run the casters (step-by-step)
          </Link>
        </div>
        <Button
          size="lg"
          variant={running ? 'danger' : 'primary'}
          icon={<Power className="h-5 w-5" />}
          disabled={!speechSupported()}
          onClick={() => (running ? engine.stop() : engine.start())}
        >
          {running ? 'Stop casting engine' : 'Start casting engine'}
        </Button>
      </header>

      {!isEdge && (
        <Notice tone="info">
          Tip: run this page in <strong>Microsoft Edge</strong> — it has free natural Philippine voices (James &amp; Rosa en-PH, Angelo &amp; Blessica fil-PH) that make the Taglish sound right.
          Capture the audio in OBS with <em>Application Audio Capture</em> (pick the Edge window) or Desktop Audio.
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card
          title="On the desk"
          subtitle={running ? 'Listening for controller events…' : 'Press Start (a click is required before the browser allows speech).'}
          actions={
            <Button size="sm" variant="secondary" disabled={!live.data.matchId} icon={<Shuffle className="h-4 w-4" />} onClick={() => toast.run(() => rerollCasters(live.data))}>
              Random pair
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {CASTERS.map((c) => {
              const isSeated = seated.includes(c.id);
              const speaking = status?.speaking?.casterId === c.id;
              return (
                <div key={c.id} className={cn('rounded-2xl border p-3 transition', isSeated ? 'border-brand/60 bg-brand/5' : 'border-line opacity-70', speaking && 'shadow-glow')}>
                  <div className="flex items-center gap-3">
                    <CasterAvatar casterId={c.id} url={profiles[c.id]?.avatarUrl} size={44} speaking={speaking} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-semibold">
                        {profiles[c.id]?.displayName || c.name} {isSeated && <Badge tone="live">On mic</Badge>}
                      </p>
                      <p className="text-xs text-muted">
                        {c.gender === 'male' ? 'Male' : 'Female'} · {c.role}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {realistic && (
                      <label className="flex items-center gap-2">
                        <span className="w-14 shrink-0 font-cond text-[10px] font-semibold uppercase tracking-wider text-brand">Live</span>
                        <Select
                          className="h-8 py-0 text-xs"
                          value={geminiVoices[c.id] ?? TTS_PROFILE[c.id].voice}
                          onChange={(e) => setGeminiVoices((m) => ({ ...m, [c.id]: e.target.value }))}
                        >
                          {(['male', 'female'] as const).map((g) => (
                            <optgroup key={g} label={g === 'male' ? 'Male voices' : 'Female voices'}>
                              {GEMINI_VOICES.filter((v) => v.gender === g).map((v) => (
                                <option key={v.name} value={v.name}>
                                  {v.name} — {v.character}
                                  {v.name === TTS_PROFILE[c.id].voice ? ' (default)' : ''}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </Select>
                      </label>
                    )}
                    <label className="flex items-center gap-2">
                      <span className="w-14 shrink-0 font-cond text-[10px] font-semibold uppercase tracking-wider text-muted">{realistic ? 'Backup' : 'Voice'}</span>
                      <Select
                        className="h-8 py-0 text-xs"
                        value={voiceMap[c.id] ?? ''}
                        onChange={(e) => setVoiceMap((m) => ({ ...m, [c.id]: e.target.value || null }))}
                      >
                        <option value="">Browser default</option>
                        {voices.map((v) => (
                          <option key={v.voiceURI} value={v.voiceURI}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </Select>
                    </label>
                    <Button size="sm" variant="secondary" className="w-full" icon={<Volume2 className="h-4 w-4" />} onClick={() => void engine.testVoice(c.id as CasterId, c.catchphrases[0])}>
                      Test {realistic ? 'live voice' : 'voice'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 min-h-[72px] rounded-2xl border border-line bg-surface2 p-4">
            {status?.speaking ? (
              <div className="flex items-start gap-3">
                <CasterAvatar casterId={status.speaking.casterId} url={profiles[status.speaking.casterId]?.avatarUrl} size={36} speaking />
                <div>
                  <p className="font-cond text-xs font-semibold uppercase tracking-wider" style={{ color: CASTER_BY_ID[status.speaking.casterId]?.color }}>
                    {CASTER_BY_ID[status.speaking.casterId]?.name} · {status.speaking.source === 'ai' ? 'AI live' : 'pre-shoutcast'}
                  </p>
                  <p className="text-lg font-semibold leading-snug">{status.speaking.text}</p>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Mic2 className="h-4 w-4" /> {running ? 'Waiting for the next play…' : 'Engine stopped.'}
              </p>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Queue" value={status?.queue ?? 0} />
            <Stat label="AI calls today" value={`${status?.aiCallsToday ?? aiUsageToday()} / ${settings.dailyCap}`} />
            <Stat label="AI cooldown" value={status && status.cooldownLeftMs > 0 ? `${Math.ceil(status.cooldownLeftMs / 1000)}s` : 'ready'} />
            <Stat label="Lines ready" value={(builtinCount() + aiEntries).toLocaleString()} />
          </dl>
          {status?.lastError && <p className="mt-2 text-xs text-amber-500">Last AI issue: {status.lastError} (used pre-shoutcast lines instead)</p>}
        </Card>

        <Card title="Quota & behaviour" subtitle="Keeps the free Gemini tier alive for a full tournament day.">
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface2 p-3">
              <p className="label">Voice engine</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {VOICE_ENGINES.map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => set('voiceEngine', o.v)}
                    className={cn('rounded-lg border p-2.5 text-left transition', settings.voiceEngine === o.v ? 'border-brand bg-brand/10' : 'border-line hover:border-brand/50')}
                  >
                    <span className="block text-sm font-semibold">{o.title}</span>
                    <span className="block text-xs text-muted">{o.desc}</span>
                  </button>
                ))}
              </div>
              {realistic && (
                <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
                  <p className="text-xs text-muted">
                    Realistic clips today: <strong className="text-fg">{status?.ttsCallsToday ?? ttsUsageToday()}</strong> / {settings.ttsDailyCap}. The free Gemini tier allows only a few voice
                    requests per day — enable billing in Google AI Studio for a full broadcast. When the quota runs out, the casters switch to browser voices automatically.
                  </p>
                  <Field label="Daily cap">
                    <Input type="number" min={0} className="w-24" value={settings.ttsDailyCap} onChange={(e) => set('ttsDailyCap', Math.max(0, Number(e.target.value)))} />
                  </Field>
                </div>
              )}
              {status?.voiceNote && <p className="mt-2 text-xs text-amber-500">{status.voiceNote}</p>}
            </div>
            <Switch checked={settings.aiEnabled} onChange={(v) => set('aiEnabled', v)} label={<span>Live Gemini calls {settings.aiEnabled ? 'on' : 'off (library only, zero quota)'}</span>} />
            <Switch
              checked={settings.aiOnlyPriority}
              disabled={!settings.aiEnabled}
              onChange={(v) => set('aiOnlyPriority', v)}
              label={<span>Live AI only for replays with a description, series wins &amp; draft breakdowns</span>}
            />
            <Switch checked={settings.aiMinorEvents} disabled={!settings.aiEnabled || settings.aiOnlyPriority} onChange={(v) => set('aiMinorEvents', v)} label="Also use live AI for minor events" />
            <Field label={`AI cooldown — ${settings.cooldownSec}s between calls`}>
              <input type="range" min={10} max={15} value={settings.cooldownSec} onChange={(e) => set('cooldownSec', Number(e.target.value))} className="w-full accent-[rgb(var(--brand))]" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Daily AI cap">
                <Input type="number" min={0} value={settings.dailyCap} onChange={(e) => set('dailyCap', Math.max(0, Number(e.target.value)))} />
              </Field>
              <Field label="Max queued events">
                <Input type="number" min={1} max={10} value={settings.maxQueue} onChange={(e) => set('maxQueue', Math.max(1, Number(e.target.value)))} />
              </Field>
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-3">
              <Switch checked={settings.idleBanter} onChange={(v) => set('idleBanter', v)} label="Desk banter when quiet" />
              <Input type="number" min={20} max={300} value={settings.idleSec} onChange={(e) => set('idleSec', Math.max(20, Number(e.target.value)))} title="Seconds of silence before banter" />
            </div>
            <Switch checked={settings.aiBanter} disabled={!settings.aiEnabled || settings.aiOnlyPriority} onChange={(v) => set('aiBanter', v)} label="Use AI for banter (uses more quota)" />
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Volume ${Math.round(settings.volume * 100)}%`}>
                <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => set('volume', Number(e.target.value))} className="w-full accent-[rgb(var(--brand))]" />
              </Field>
              <Field label={`Speed ${settings.rate.toFixed(2)}×`}>
                <input type="range" min={0.8} max={1.4} step={0.05} value={settings.rate} onChange={(e) => set('rate', Number(e.target.value))} className="w-full accent-[rgb(var(--brand))]" />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      <Card
        title="Gemini pre-generated event calls"
        subtitle={`${eventPairCount()} built-in event calls + ${aiEntries} Gemini pre-generated (optional). Lines use placeholders like {player} and {team}, so one generation serves every match — and most in-game events cost zero live AI calls.`}
        actions={
          <>
            <Select value={perKey} onChange={(e) => setPerKey(Number(e.target.value))} className="h-8 w-36 py-0 text-xs">
              {[4, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} per moment
                </option>
              ))}
            </Select>
            <Button size="sm" loading={!!genProgress} icon={<Wand2 className="h-4 w-4" />} onClick={generate}>
              {genProgress ? `Generating ${genProgress.done}/${genProgress.total}` : 'Pre-generate with Gemini'}
            </Button>
            {aiEntries > 0 && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => {
                  if (confirm('Delete all Gemini pre-generated lines? (Built-in lines stay.)')) void toast.run(clearLibrary, 'AI library cleared');
                }}
              />
            )}
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {SCRIPT_KEYS.map((k) => (
            <span key={k} className="chip">
              <BookOpen className="h-3 w-3 text-brand" />
              {k.replace(/_/g, ' ').toLowerCase()}
              {byKey[k] ? <span className="text-accent">+{byKey[k]}</span> : null}
            </span>
          ))}
        </div>
        {library.data?.entries?.length ? (
          <ul className="scrollbar-thin mt-4 max-h-56 space-y-1.5 overflow-y-auto text-sm">
            {library.data.entries.slice(-12).reverse().map((e, i) => (
              <li key={i} className="rounded-lg bg-surface2 px-3 py-2">
                <span className="mr-2 font-cond text-[11px] font-semibold uppercase tracking-wider text-brand">{e.key}</span>
                {e.lead} <span className="text-muted">/ {e.follow}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <LineLibrary profiles={profiles} />

      <Card title="Commentary log" subtitle="What was said, where it came from and how long AI took.">
        {!log.length ? (
          <p className="text-sm text-muted">Nothing yet — trigger an event from the Live Controller.</p>
        ) : (
          <ul className="scrollbar-thin max-h-[480px] space-y-3 overflow-y-auto">
            {log.map((e) => (
              <li key={e.id} className="rounded-xl border border-line p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={e.source === 'ai' ? 'accent' : e.source === 'template' ? 'brand' : 'muted'}>
                    {e.source === 'ai' ? (
                      <>
                        <Bot className="h-3 w-3" /> AI {e.latencyMs}ms
                      </>
                    ) : e.source === 'template' ? (
                      <>
                        <Sparkles className="h-3 w-3" /> Pre-shoutcast
                      </>
                    ) : (
                      e.source
                    )}
                  </Badge>
                  <span className="font-semibold">{e.summary}</span>
                  <span className="ml-auto text-muted">{new Date(e.at).toLocaleTimeString()}</span>
                </div>
                {e.lines.map((l, i) => (
                  <p key={i} className="text-sm">
                    <strong style={{ color: CASTER_BY_ID[l.casterId]?.color === '#ffffff' ? undefined : CASTER_BY_ID[l.casterId]?.color }}>{CASTER_BY_ID[l.casterId]?.name}:</strong> {l.text}
                  </p>
                ))}
                {e.note && <p className="mt-1 text-xs text-muted">{e.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <dt className="font-cond text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="font-display text-2xl leading-none">{value}</dd>
    </div>
  );
}
