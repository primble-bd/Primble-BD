import { useEffect, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { mountPrimbleApp } from './primbleApp';
import { initNativeAndroidBridge } from './utils/nativeAndroid';

function PrimbleShell() {
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    registerSW({ immediate: true });
    void initNativeAndroidBridge();
    mountPrimbleApp();
  }, []);

  return <div id="app" />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <PrimbleShell />
      <PWAInstallButton />
      <OfflineIndicator />
    </ErrorBoundary>
  );
}
