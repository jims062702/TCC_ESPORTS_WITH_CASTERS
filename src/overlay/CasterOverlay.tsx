import { useOverlayLive } from './demo';
import { CasterStrip, OverlayStage, flag, useQuery } from './OverlayKit';

/**
 * OBS Browser Source: /overlay/casters — just the active caster pair and their
 * live subtitles as a lower third. Useful on caster-cam / desk scenes.
 */
export default function CasterOverlay() {
  const { live } = useOverlayLive();
  const q = useQuery();
  return (
    <OverlayStage>
      <div className="absolute inset-x-0 bottom-10 flex justify-center">
        <CasterStrip casters={live.casters} captions={flag(q, 'captions')} size="lg" />
      </div>
    </OverlayStage>
  );
}
