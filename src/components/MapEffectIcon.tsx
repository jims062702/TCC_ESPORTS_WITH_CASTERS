import { Castle, Cloud, Eye, Shell } from 'lucide-react';
import type { MapEffect } from '@/types';

const ICONS: Record<MapEffect, typeof Eye> = { revealingWisps: Eye, healingTurtle: Shell, goldenTurret: Castle, flyingCloud: Cloud };

/** Icon for a 2026 battlefield effect. */
export function MapEffectIcon({ effect, className, style }: { effect: MapEffect; className?: string; style?: React.CSSProperties }) {
  const Icon = ICONS[effect] ?? Eye;
  return <Icon className={className} style={style} />;
}
