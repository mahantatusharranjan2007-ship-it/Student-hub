import { useEffect, useState } from 'react';

export type DeviceMode = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
  mode: DeviceMode;
  viewportWidth: number;
  viewportHeight: number;
  isStandalone: boolean;
}

export function detectDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return {
      mode: 'desktop',
      viewportWidth: 1280,
      viewportHeight: 800,
      isStandalone: false,
    };
  }

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;

  const screenW = window.screen?.width || viewportWidth;
  const screenH = window.screen?.height || viewportHeight;
  const screenShort = Math.min(screenW, screenH);
  const screenLong = Math.max(screenW, screenH);
  const screenAspect = screenShort > 0 ? screenLong / screenShort : 1;

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  const ua = window.navigator.userAgent || '';
  const maxTouchPoints = window.navigator.maxTouchPoints || 0;
  const hasCoarsePointer =
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(any-pointer: coarse)').matches;
  const isFinePrimaryPointer =
    window.matchMedia('(pointer: fine)').matches && window.matchMedia('(hover: hover)').matches;

  const isPhoneUA =
    /iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(ua) ||
    (/Android/i.test(ua) && /Mobile/i.test(ua));

  const isTabletUA =
    /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
    (window.navigator.platform === 'MacIntel' && maxTouchPoints > 1);

  const isTouchPrimaryDevice = (hasCoarsePointer || maxTouchPoints > 0) && !isFinePrimaryPointer;

  let mode: DeviceMode;

  // 1. Mobile Phone:
  // Always use Mobile View on phones, even when an Android browser/WebAPK
  // reports a desktop-sized ~980px viewport or spoofs desktop UA in "Desktop site" mode.
  if (
    viewportWidth < 768 ||
    (isTouchPrimaryDevice && isPhoneUA) ||
    (isTouchPrimaryDevice && !isTabletUA && screenShort > 0 && screenShort < 600) ||
    (isTouchPrimaryDevice && !isTabletUA && screenAspect >= 1.72 && viewportWidth <= 1080)
  ) {
    mode = 'mobile';
  }
  // 2. Tablet:
  // Dedicated Tablet View for iPads, Android tablets, and tablet-width viewports (768..1023px).
  else if (
    isTabletUA ||
    (isTouchPrimaryDevice && screenShort >= 600 && screenShort <= 1120) ||
    viewportWidth < 1024
  ) {
    mode = 'tablet';
  }
  // 3. PC / Desktop:
  else {
    mode = 'desktop';
  }

  return {
    mode,
    viewportWidth,
    viewportHeight,
    isStandalone,
  };
}

export function useDeviceInfo(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(() => detectDeviceInfo());

  useEffect(() => {
    const sync = () => {
      const next = detectDeviceInfo();
      document.documentElement.dataset.deviceMode = next.mode;
      document.documentElement.dataset.standalone = next.isStandalone ? 'true' : 'false';
      setInfo((prev) =>
        prev.mode === next.mode &&
        prev.viewportWidth === next.viewportWidth &&
        prev.viewportHeight === next.viewportHeight &&
        prev.isStandalone === next.isStandalone
          ? prev
          : next
      );
    };

    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);

    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const pointerQuery = window.matchMedia('(pointer: coarse)');
    standaloneQuery.addEventListener?.('change', sync);
    pointerQuery.addEventListener?.('change', sync);

    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      standaloneQuery.removeEventListener?.('change', sync);
      pointerQuery.removeEventListener?.('change', sync);
    };
  }, []);

  return info;
}

export function useDeviceMode(): DeviceMode {
  return useDeviceInfo().mode;
}
