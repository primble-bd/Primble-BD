import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (isInstalled || dismissed) {
    return null;
  }

  if (isInstallable) {
    return (
      <div className="fixed bottom-[76px] right-4 z-40 flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-xl border border-slate-700 md:bottom-5">
        <button
          type="button"
          onClick={install}
          className="flex items-center gap-1.5 bg-transparent border-0 text-white cursor-pointer p-0 font-semibold text-xs"
        >
          <Download className="w-4 h-4 text-rose-400" />
          Install App
        </button>
        <button
          type="button"
          aria-label="Dismiss install prompt"
          onClick={() => setDismissed(true)}
          className="ml-1 rounded-md p-0.5 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (isIOS) {
    return (
      <>
        <div className="fixed bottom-[76px] right-4 z-40 flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-lg border border-slate-200 md:bottom-5">
          <button
            type="button"
            onClick={() => setShowIOSGuide(true)}
            className="flex items-center gap-1.5 bg-transparent border-0 text-slate-900 cursor-pointer p-0 font-semibold text-xs"
          >
            <Smartphone className="w-4 h-4 text-rose-600" />
            Install on iOS
          </button>
          <button
            type="button"
            aria-label="Dismiss iOS install hint"
            onClick={() => setDismissed(true)}
            className="ml-1 rounded-md p-0.5 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
              <h3 className="text-base font-semibold text-slate-900 m-0">Install Primble BD on iPhone / iPad</h3>
              <p className="mt-2 text-sm text-slate-600">
                1. Tap the <strong>Share</strong> icon in Safari toolbar.<br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white border-0 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-[76px] left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-lg md:bottom-5">
      <WifiOff className="w-3.5 h-3.5" />
      Offline Mode — Cached data active
    </div>
  );
};
