import { lazy, Suspense, useEffect, useState } from 'react';
import { registerMcpBridge } from './mcp/bridge';
import { LoginPage } from './pages/LoginPage';
import { MainPage } from './pages/MainPage';
import { useAppStore } from './lib/store';

// Dev-only screen gallery, kept out of production bundles via lazy import.
const PreviewGallery = lazy(() => import('./dev/PreviewGallery').then((m) => ({ default: m.PreviewGallery })));

function usePreviewScreen(): string | null {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  if (!import.meta.env.DEV) return null;
  const match = /^#\/preview(?:\/([\w-]*))?$/.exec(hash);
  return match ? match[1] || 'login' : null;
}

export default function App() {
  const isHydrated = useAppStore((s) => s.isHydrated);
  const token = useAppStore((s) => s.token);
  const profile = useAppStore((s) => s.profile);
  const hydrate = useAppStore((s) => s.hydrate);
  const previewScreen = usePreviewScreen();

  useEffect(() => {
    hydrate();
    registerMcpBridge();
  }, [hydrate]);

  if (previewScreen) {
    return (
      <Suspense fallback={null}>
        <PreviewGallery screen={previewScreen} />
      </Suspense>
    );
  }

  // Hydration takes a few ms; render nothing to avoid a login-page flash.
  if (!isHydrated) return null;

  return token && profile ? <MainPage /> : <LoginPage />;
}
