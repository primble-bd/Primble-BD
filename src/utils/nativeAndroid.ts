import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

let initialized = false;

export async function initNativeAndroidBridge(): Promise<void> {
  if (initialized || !Capacitor.isNativePlatform()) {
    return;
  }
  initialized = true;

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: '#09090B' });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // Ignore on platforms where status bar styling is unsupported
  }

  try {
    await CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
        return;
      }
      CapApp.minimizeApp().catch(() => {
        CapApp.exitApp().catch(() => {});
      });
    });
  } catch {
    // Ignore listener errors outside native Android runtime
  }
}
