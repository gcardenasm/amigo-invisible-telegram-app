import type { Env, TelegramUser } from './env';

const MAX_INIT_DATA_AGE_SECONDS = 86_400; // 24 horas

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256(keyBytes: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const msgBytes = new Uint8Array(new TextEncoder().encode(message)).buffer;
  return crypto.subtle.sign('HMAC', key, msgBytes);
}

export interface VerifiedInitData {
  user: TelegramUser;
  startParam?: string;
}

/**
 * Verifica criptográficamente el parámetro initData de Telegram WebApp usando HMAC-SHA256.
 * Documentación oficial: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<VerifiedInitData | null> {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash) return null;

  const authDateRaw = params.get('auth_date');
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate) || nowSeconds - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    return null;
  }

  const entries: Array<[string, string]> = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    entries.push([key, value]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const webAppKeyBytes = new Uint8Array(new TextEncoder().encode('WebAppData')).buffer;
  const secretKey = await hmacSha256(webAppKeyBytes, botToken);
  const computedHashBuffer = await hmacSha256(secretKey, dataCheckString);
  const computedHash = toHex(computedHashBuffer);

  if (!timingSafeEqualHex(computedHash.toLowerCase(), receivedHash.toLowerCase())) {
    return null;
  }

  const userJson = params.get('user');
  if (!userJson) return null;

  try {
    const parsed = JSON.parse(userJson) as {
      id?: unknown;
      first_name?: unknown;
      last_name?: unknown;
      username?: unknown;
      language_code?: unknown;
    };

    if (typeof parsed.id !== 'number' || typeof parsed.first_name !== 'string') {
      return null;
    }

    return {
      user: {
        id: parsed.id,
        firstName: parsed.first_name,
        lastName: typeof parsed.last_name === 'string' ? parsed.last_name : undefined,
        username:
          typeof parsed.username === 'string'
            ? parsed.username.replace(/^@/, '').toLowerCase()
            : undefined,
        languageCode:
          typeof parsed.language_code === 'string' ? parsed.language_code : undefined
      },
      startParam: params.get('start_param') ?? undefined
    };
  } catch {
    return null;
  }
}

export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<TelegramUser | null> {
  const initData = request.headers.get('X-Telegram-Init-Data') ?? '';
  if (initData) {
    const verified = await verifyTelegramInitData(initData, env.BOT_TOKEN);
    return verified?.user ?? null;
  }

  // Modo desarrollo local exclusivamente si DEV_MODE=true en .dev.vars
  if (env.DEV_MODE === 'true') {
    const devIdRaw = request.headers.get('X-Dev-User-Id');
    if (devIdRaw) {
      const devId = Number(devIdRaw);
      if (Number.isInteger(devId) && devId > 0) {
        const devName = request.headers.get('X-Dev-User-Name') || 'Organizador Demo';
        const devUsername = request.headers.get('X-Dev-Username') || undefined;
        return {
          id: devId,
          firstName: decodeURIComponent(devName),
          username: devUsername ? devUsername.replace(/^@/, '').toLowerCase() : undefined
        };
      }
    }
  }

  return null;
}

export function formatDisplayName(user: TelegramUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Participante';
}
