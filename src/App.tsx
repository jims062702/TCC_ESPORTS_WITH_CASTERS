import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui';
import LandingPage from './landing/LandingPage';

// Admin & overlay bundles are code-split so the public landing page stays light.
const GuidePage = lazy(() => import('./guide/GuidePage'));
const PlayerPage = lazy(() => import('./landing/PlayerPage'));
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const Login = lazy(() => import('./admin/Login'));
const Dashboard = lazy(() => import('./admin/Dashboard'));
const TeamsAdmin = lazy(() => import('./admin/TeamsAdmin'));
const TournamentsAdmin = lazy(() => import('./admin/TournamentsAdmin'));
const Controller = lazy(() => import('./admin/controller/Controller'));
const CasterBooth = lazy(() => import('./admin/CasterBooth'));
const MediaAdmin = lazy(() => import('./admin/MediaAdmin'));
const SettingsAdmin = lazy(() => import('./admin/SettingsAdmin'));

const DraftOverlay = lazy(() => import('./overlay/DraftOverlay'));
const HudOverlay = lazy(() => import('./overlay/HudOverlay'));
const ReplayOverlay = lazy(() => import('./overlay/ReplayOverlay'));
const BreakOverlay = lazy(() => import('./overlay/BreakOverlay'));
const CasterOverlay = lazy(() => import('./overlay/CasterOverlay'));

const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Spinner className="h-8 w-8" />
  </div>
);

const S = ({ children, overlay }: { children: ReactNode; overlay?: boolean }) => (
  <Suspense fallback={overlay ? null : <PageFallback />}>{children}</Suspense>
);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route path="/guide" element={<S><GuidePage /></S>} />
      <Route path="/players/:id" element={<S><PlayerPage /></S>} />
      <Route path="/admin/login" element={<S><Login /></S>} />
      <Route path="/admin" element={<S><AdminLayout /></S>}>
        <Route index element={<S><Dashboard /></S>} />
        <Route path="teams" element={<S><TeamsAdmin /></S>} />
        <Route path="tournaments" element={<S><TournamentsAdmin /></S>} />
        <Route path="controller" element={<S><Controller /></S>} />
        <Route path="booth" element={<S><CasterBooth /></S>} />
        <Route path="media" element={<S><MediaAdmin /></S>} />
        <Route path="settings" element={<S><SettingsAdmin /></S>} />
      </Route>

      {/* OBS Browser Sources — 1920×1080, transparent background */}
      <Route path="/overlay/draft" element={<S overlay><DraftOverlay /></S>} />
      <Route path="/overlay/hud" element={<S overlay><HudOverlay /></S>} />
      <Route path="/overlay/replay" element={<S overlay><ReplayOverlay /></S>} />
      <Route path="/overlay/break" element={<S overlay><BreakOverlay /></S>} />
      <Route path="/overlay/casters" element={<S overlay><CasterOverlay /></S>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
