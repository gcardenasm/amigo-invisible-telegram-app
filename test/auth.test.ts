import { describe, expect, it } from 'vitest';
import { verifyTelegramInitData } from '../src/worker/auth';

async function signInitData(
  paramsObj: Record<string, string>,
  botToken: string
): Promise<string> {
  const entries = Object.entries(paramsObj).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const enc = new TextEncoder();
  const webAppKey = await crypto.subtle.importKey(
    'raw',
    enc.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const secretKey = await crypto.subtle.sign('HMAC', webAppKey, enc.encode(botToken));
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dataCheckString));
  const hash = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const sp = new URLSearchParams({ ...paramsObj, hash });
  return sp.toString();
}

describe('verifyTelegramInitData', () => {
  const token = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  const now = 1_760_000_000;

  it('valida correctamente un initData firmado por Telegram', async () => {
    const initData = await signInitData(
      {
        auth_date: String(now - 60),
        query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
        start_param: 'join_ABCD1234',
        user: JSON.stringify({
          id: 99887766,
          first_name: 'Gabriel',
          last_name: 'Cárdenas',
          username: 'gabriel_tg',
          language_code: 'es'
        })
      },
      token
    );

    const verified = await verifyTelegramInitData(initData, token, now);
    expect(verified).not.toBeNull();
    expect(verified?.user.id).toBe(99887766);
    expect(verified?.user.username).toBe('gabriel_tg');
    expect(verified?.startParam).toBe('join_ABCD1234');
  });

  it('rechaza initData manipulado o firmado con otro token', async () => {
    const initData = await signInitData(
      {
        auth_date: String(now - 60),
        user: JSON.stringify({ id: 123, first_name: 'Ana' })
      },
      'otro_token'
    );

    const verified = await verifyTelegramInitData(initData, token, now);
    expect(verified).toBeNull();
  });

  it('rechaza initData caducado (>24h)', async () => {
    const initData = await signInitData(
      {
        auth_date: String(now - 90_000),
        user: JSON.stringify({ id: 123, first_name: 'Ana' })
      },
      token
    );

    const verified = await verifyTelegramInitData(initData, token, now);
    expect(verified).toBeNull();
  });
});
