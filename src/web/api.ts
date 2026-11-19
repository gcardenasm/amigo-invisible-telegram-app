import type { GiftStatus, RoomDetailDto, RoomSummaryDto } from '../shared/types';
import { getActiveDevProfile, getTelegramWebApp } from './telegram-sdk';

export interface MeResponse {
  user: {
    id: number;
    displayName: string;
    username: string | null;
  };
  botUsername: string;
  botReachable: boolean;
  devMode: boolean;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  const wa = getTelegramWebApp();
  if (wa?.initData) {
    headers.set('X-Telegram-Init-Data', wa.initData);
  } else {
    const dev = getActiveDevProfile();
    headers.set('X-Dev-User-Id', String(dev.id));
    headers.set('X-Dev-User-Name', encodeURIComponent(dev.name));
    headers.set('X-Dev-Username', dev.username);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, signal: controller.signal });
  } catch (err) {
    window.clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'El servidor backend tardó demasiado en responder. Comprueba que "npm run dev:worker" está ejecutándose en el puerto 8787.'
      );
    }
    throw new Error(
      'No se pudo conectar con el servidor backend. Asegúrate de tener ejecutando "npm run dev:worker".'
    );
  } finally {
    window.clearTimeout(timeoutId);
  }

  const text = await res.text();
  let body: { error?: string } & T = {} as { error?: string } & T;
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string } & T;
    } catch {
      if (!res.ok) {
        throw new Error(
          `El backend devolvió una respuesta inesperada (${res.status}). Verifica que "npm run dev:worker" está activo.`
        );
      }
    }
  }
  if (!res.ok) {
    throw new Error(body.error || `Error ${res.status}`);
  }
  return body;
}

export const api = {
  getMe: () => apiFetch<MeResponse>('/api/me'),
  pingBot: (roomCode?: string) =>
    apiFetch<{ reachable: boolean; error?: string }>('/api/bot/ping', {
      method: 'POST',
      body: JSON.stringify({ roomCode })
    }),
  listRooms: () => apiFetch<{ rooms: RoomSummaryDto[] }>('/api/rooms'),
  createRoom: (data: {
    title: string;
    maxBudget: number | null;
    currency: string;
    revealDate: string;
    notes: string;
  }) =>
    apiFetch<{ code: string }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  joinRoom: (data: { roomCode?: string; claimToken?: string }) =>
    apiFetch<{ code: string; claimedSlot: boolean }>('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getRoom: (code: string) => apiFetch<RoomDetailDto>(`/api/rooms/${encodeURIComponent(code)}`),
  updateRoom: (
    code: string,
    data: {
      title: string;
      maxBudget: number | null;
      currency: string;
      revealDate: string;
      notes: string;
    }
  ) =>
    apiFetch<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  deleteRoom: (code: string) =>
    apiFetch<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(code)}`, {
      method: 'DELETE'
    }),
  addParticipant: (code: string, data: { displayName: string; telegramUsername?: string }) =>
    apiFetch<{ id: string; claimToken: string }>(
      `/api/rooms/${encodeURIComponent(code)}/participants`,
      { method: 'POST', body: JSON.stringify(data) }
    ),
  removeParticipant: (code: string, participantId: string) =>
    apiFetch<{ ok: boolean }>(
      `/api/rooms/${encodeURIComponent(code)}/participants/${encodeURIComponent(participantId)}`,
      { method: 'DELETE' }
    ),
  addWishlistItem: (code: string, data: { title: string; url: string; notes: string }) =>
    apiFetch<{ id: string }>(`/api/rooms/${encodeURIComponent(code)}/wishlist`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateWishlistItem: (
    code: string,
    itemId: string,
    data: { title: string; url: string; notes: string }
  ) =>
    apiFetch<{ ok: boolean }>(
      `/api/rooms/${encodeURIComponent(code)}/wishlist/${encodeURIComponent(itemId)}`,
      { method: 'PUT', body: JSON.stringify(data) }
    ),
  deleteWishlistItem: (code: string, itemId: string) =>
    apiFetch<{ ok: boolean }>(
      `/api/rooms/${encodeURIComponent(code)}/wishlist/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' }
    ),
  addExclusion: (
    code: string,
    data: { giverId: string; excludedReceiverId: string; mutual: boolean }
  ) =>
    apiFetch<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(code)}/exclusions`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  deleteExclusion: (code: string, exclusionId: string) =>
    apiFetch<{ ok: boolean }>(
      `/api/rooms/${encodeURIComponent(code)}/exclusions/${encodeURIComponent(exclusionId)}`,
      { method: 'DELETE' }
    ),
  runDraw: (code: string, redraw = false) =>
    apiFetch<{
      ok: boolean;
      notifiedCount: number;
      totalParticipants: number;
      pendingParticipants: string[];
    }>(`/api/rooms/${encodeURIComponent(code)}/draw`, {
      method: 'POST',
      body: JSON.stringify({ redraw })
    }),
  remindPending: (code: string) =>
    apiFetch<{ sentCount: number; unreachableNames: string[] }>(
      `/api/rooms/${encodeURIComponent(code)}/remind`,
      { method: 'POST', body: '{}' }
    ),
  prepareShareMessage: (code: string, data?: { claimToken?: string }) =>
    apiFetch<{
      preparedMessageId: string | null;
      inviteUrl: string;
      inlineDisabled?: boolean;
      error?: string;
    }>(`/api/rooms/${encodeURIComponent(code)}/share-message`, {
      method: 'POST',
      body: JSON.stringify(data ?? {})
    }),
  updateProfile: (
    code: string,
    data: { displayName?: string; sizes?: string; allergies?: string; dislikes?: string }
  ) =>
    apiFetch<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(code)}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  leaveRoom: (code: string) =>
    apiFetch<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(code)}/leave`, {
      method: 'POST',
      body: '{}'
    }),
  updateGiftStatus: (code: string, giftStatus: GiftStatus) =>
    apiFetch<{ ok: boolean; giftStatus: GiftStatus }>(
      `/api/rooms/${encodeURIComponent(code)}/gift-status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ giftStatus })
      }
    ),
  sendAnonymousMessage: (
    code: string,
    data: { thread: 'to_target' | 'to_santa'; body: string }
  ) =>
    apiFetch<{ id: string; createdAt: string }>(
      `/api/rooms/${encodeURIComponent(code)}/chat`,
      {
        method: 'POST',
        body: JSON.stringify(data)
      }
    ),
  revealRoom: (code: string) =>
    apiFetch<{ ok: boolean; notifiedCount: number; totalParticipants: number }>(
      `/api/rooms/${encodeURIComponent(code)}/reveal`,
      { method: 'POST', body: '{}' }
    )
};
