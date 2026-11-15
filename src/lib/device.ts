const DEVICE_FP_KEY = 'ddu_hub_device_fp';

export function getDeviceMetadata(): {
  deviceFingerprint: string;
  deviceName: string;
  platform: string;
} {
  let fingerprint = '';
  try {
    fingerprint = localStorage.getItem(DEVICE_FP_KEY) || '';
    if (!fingerprint) {
      fingerprint =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_FP_KEY, fingerprint);
    }
  } catch {
    fingerprint = 'ephemeral-browser';
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let os = 'Web';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  const isStandalone =
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches;

  return {
    deviceFingerprint: fingerprint,
    deviceName: `${browser} on ${os}${isStandalone ? ' (PWA)' : ''}`,
    platform: isStandalone ? `${os.toLowerCase()}-pwa` : os.toLowerCase(),
  };
}
