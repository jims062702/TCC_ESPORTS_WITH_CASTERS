import { Castle, Eye, Map as MapIcon, X } from 'lucide-react';
import type { LiveState, MapEffect, Side, TurretTier } from '@/types';
import { MAP_EFFECTS, MAP_EFFECT_IDS, TURRET_TIERS } from '@/lib/constants';
import { setMapEffect } from '@/services/live';
import { sideTeam } from '@/services/facts';
import { MapEffectIcon } from '@/components/MapEffectIcon';
import { Button } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

/**
 * This game's battlefield effect (2026 map). The game rolls one per match —
 * pick it during the draft: the draft overlay reveals it with an animation and
 * keeps it next to "Best of", the HUD shows it in-game and the casters explain it.
 */
export function MapEffectPicker({ live, compact = false }: { live: LiveState; compact?: boolean }) {
  const toast = useToast();
  const effect = live.mapEffect ?? null;
  const pick = (e: MapEffect) => {
    if (e === effect) return;
    void toast.run(async () => void (await setMapEffect(live, e)), `${MAP_EFFECTS[e].label} revealed on stream`);
  };
  return (
    <div className={cn('rounded-xl border border-line', compact ? 'p-3' : 'p-3')} data-testid="map-effect-picker">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-cond text-xs font-semibold uppercase tracking-wider text-muted">
          <MapIcon className="h-3.5 w-3.5" /> Battlefield (2026 map) — choose the one the game rolled
        </p>
        {effect && (
          <Button size="xs" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => void toast.run(async () => void (await setMapEffect(live, null)))}>
            Clear
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {MAP_EFFECT_IDS.map((e) => {
          const on = effect === e;
          const color = MAP_EFFECTS[e].color;
          return (
            <button
              key={e}
              onClick={() => pick(e)}
              title={MAP_EFFECTS[e].detail}
              aria-pressed={on}
              className={cn('flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition active:scale-[0.98]', on ? 'shadow-sm' : 'border-line hover:bg-surface2')}
              style={on ? { borderColor: color, background: `${color}1f`, boxShadow: `0 0 0 1px ${color}55` } : undefined}
            >
              <MapEffectIcon effect={e} className="h-5 w-5 shrink-0" style={{ color }} />
              <span className="min-w-0">
                <span className="block font-cond text-sm font-bold uppercase tracking-wide">{MAP_EFFECTS[e].label}</span>
                <span className="block text-[11px] leading-tight text-muted">{MAP_EFFECTS[e].short}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** In-game: battlefield effect + turrets and wisp reveals. */
export function BattlefieldControls({ live, onTurret, onWisp }: { live: LiveState; onTurret: (side: Side, tier: TurretTier) => void; onWisp: (side: Side) => void }) {
  const effect = live.mapEffect ?? null;
  return (
    <div className="mt-3 space-y-2" data-testid="battlefield">
      <p className="flex items-center gap-1.5 font-cond text-xs font-semibold uppercase tracking-wider text-muted">
        <MapIcon className="h-3.5 w-3.5" /> Battlefield:{' '}
        {effect ? (
          <span className="inline-flex items-center gap-1" style={{ color: MAP_EFFECTS[effect].color }}>
            <MapEffectIcon effect={effect} className="h-3.5 w-3.5" /> {MAP_EFFECTS[effect].label}
          </span>
        ) : (
          <span>not set — pick it in the Draft</span>
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['blue', 'red'] as const).map((side) => (
          <div key={side} className={cn('rounded-lg border p-2', side === 'blue' ? 'border-sky-500/40' : 'border-brand/40')}>
            <p className={cn('mb-1.5 flex items-center justify-between font-cond text-xs font-semibold uppercase tracking-wider', side === 'blue' ? 'text-sky-500' : 'text-brand')}>
              <span>
                {sideTeam(live, side)?.name ?? side} destroyed
                {effect === 'goldenTurret' && <span className="ml-1 text-amber-500">· golden</span>}
              </span>
              <span className="text-muted">
                {live[side].turrets ?? 0} turret{(live[side].turrets ?? 0) === 1 ? '' : 's'}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {TURRET_TIERS.map((tier) => (
                <Button key={tier} size="xs" variant="secondary" icon={<Castle className="h-3.5 w-3.5" />} onClick={() => onTurret(side, tier)}>
                  {tier}
                </Button>
              ))}
            </div>
            {effect === 'revealingWisps' && (
              <Button size="xs" variant="outline" className="mt-1.5 w-full" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => onWisp(side)}>
                Wisp reveal
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
