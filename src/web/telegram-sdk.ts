export interface TgWebApp {
  initData: string;
  initDataUnsafe?: {
    start_param?: string;
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
  };
  colorScheme?: 'light' | 'dark';
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  ready(): void;
  expand(): void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
  requestWriteAccess?(callback?: (allowed: boolean) => void): void;
  onEvent?(eventType: string, callback: () => void): void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TgWebApp;
    };
  }
}

export interface DevProfile {
  id: number;
  name: string;
  username: string;
}

export const DEV_PROFILES: DevProfile[] = [
  { id: 1001, name: 'Gabriel (Organizador)', username: 'gabriel_demo' },
  { id: 1002, name: 'Laura', username: 'laura_demo' },
  { id: 1003, name: 'Carlos', username: 'carlos_demo' },
  { id: 1004, name: 'Marta', username: 'marta_demo' }
];

let activeDevProfile: DevProfile = DEV_PROFILES[0]!;

export function getActiveDevProfile(): DevProfile {
  try {
    const savedId = Number(localStorage.getItem('dev_tg_user_id'));
    const found = DEV_PROFILES.find((p) => p.id === savedId);
    if (found) activeDevProfile = found;
  } catch {
    // ignore storage errors
  }
  return activeDevProfile;
}

export function setActiveDevProfile(id: number): void {
  const found = DEV_PROFILES.find((p) => p.id === id);
  if (found) {
    activeDevProfile = found;
    try {
      localStorage.setItem('dev_tg_user_id', String(found.id));
    } catch {
      // ignore
    }
  }
}

export function getTelegramWebApp(): TgWebApp | null {
  const wa = window.Telegram?.WebApp;
  if (!wa || !wa.initData) return null;
  return wa;
}

export async function waitForTelegramSdk(timeoutMs = 2000): Promise<void> {
  if (window.Telegram?.WebApp) return;
  const looksLikeTelegram =
    window.location.hash.includes('tgWebAppData') ||
    window.location.search.includes('tgWebApp') ||
    'TelegramWebviewProxy' in window;
  if (!looksLikeTelegram) return;

  const start = Date.now();
  while (!window.Telegram?.WebApp && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
}

export function initTelegramApp(): void {
  const wa = window.Telegram?.WebApp;
  if (!wa) return;
  wa.ready();
  wa.expand();

  const applyScheme = () => {
    if (wa.colorScheme === 'dark' || wa.colorScheme === 'light') {
      document.documentElement.style.colorScheme = wa.colorScheme;
    }
  };
  applyScheme();
  wa.onEvent?.('themeChanged', applyScheme);
}

export function getStartParam(): string | null {
  const urlParam = new URLSearchParams(window.location.search).get('tgWebAppStartParam');
  if (urlParam) return urlParam;
  return window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;
}

export function shareViaTelegram(inviteUrl: string, shareText: string): void {
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(
    inviteUrl
  )}&text=${encodeURIComponent(shareText)}`;

  const wa = window.Telegram?.WebApp;
  if (wa?.openTelegramLink) {
    wa.openTelegramLink(telegramShareUrl);
  } else {
    window.open(telegramShareUrl, '_blank', 'noopener,noreferrer');
  }
}

export function openTelegramBotLink(url: string): void {
  const wa = window.Telegram?.WebApp;
  if (wa?.openTelegramLink && url.startsWith('https://t.me/')) {
    wa.openTelegramLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function openExternalUrl(url: string): void {
  const wa = window.Telegram?.WebApp;
  if (wa?.openLink) {
    wa.openLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function requestBotWriteAccess(): Promise<boolean> {
  return new Promise((resolve) => {
    const wa = window.Telegram?.WebApp;
    if (wa?.requestWriteAccess) {
      try {
        wa.requestWriteAccess((allowed) => resolve(Boolean(allowed)));
        return;
      } catch {
        resolve(false);
        return;
      }
    }
    resolve(false);
  });
}
