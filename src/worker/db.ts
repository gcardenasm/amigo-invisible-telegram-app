import type {
  AnonymousMessageDto,
  ExclusionDto,
  GiftStatus,
  ParticipantDto,
  RevealedPairDto,
  RoomDetailDto,
  RoomStatus,
  RoomSummaryDto,
  WishlistItemDto
} from '../shared/types';
import { formatDisplayName } from './auth';
import type { Env, TelegramUser } from './env';
import {
  buildAssignmentMessageHtml,
  escapeHtml,
  normalizeBotUsername,
  sendTelegramMessage,
  type InlineButton
} from './telegram';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
  }
  return out;
}

export function randomId(): string {
  return crypto.randomUUID();
}

export function sanitizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Intentar prefijo https:// si el usuario escribió ej. amazon.es/...
    if (!/^[a-z]+:/i.test(trimmed) && trimmed.includes('.')) {
      try {
        const withHttps = new URL(`https://${trimmed}`);
        return withHttps.toString();
      } catch {
        return '';
      }
    }
  }
  return '';
}

export function buildMiniAppUrl(env: Env, startParam?: string): string {
  const base = env.WEBAPP_URL.replace(/\/$/, '');
  if (!startParam) return base;
  return `${base}/?tgWebAppStartParam=${encodeURIComponent(startParam)}`;
}

export function buildStartAppButton(env: Env, label: string, startParam: string): InlineButton[][] {
  return [[{ text: label, web_app: { url: buildMiniAppUrl(env, startParam) } }]];
}

export interface RoomRow {
  id: string;
  code: string;
  title: string;
  max_budget: number | null;
  currency: string;
  reveal_date: string;
  notes: string;
  organizer_tg_id: number;
  status: RoomStatus;
  drawn_at: string | null;
  revealed_at: string | null;
  last_reminder_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface ParticipantRow {
  id: string;
  room_id: string;
  telegram_user_id: number | null;
  telegram_username: string | null;
  display_name: string;
  claim_token: string;
  bot_reachable: number;
  is_organizer: number;
  assigned_to_id: string | null;
  notified_at: string | null;
  sizes: string;
  allergies: string;
  dislikes: string;
  gift_status: GiftStatus;
  created_at: string;
}

interface AnonymousMessageRow {
  id: string;
  sender_role: 'giver' | 'receiver';
  body: string;
  created_at: string;
}

export interface WishlistRow {
  id: string;
  participant_id: string;
  room_id: string;
  title: string;
  url: string;
  notes: string;
  position: number;
  created_at: string;
}

export interface ExclusionRow {
  id: string;
  room_id: string;
  giver_id: string;
  excluded_receiver_id: string;
  created_at: string;
}

export async function upsertKnownBotUser(
  db: D1Database,
  user: TelegramUser,
  botStarted: boolean
): Promise<boolean> {
  const now = new Date().toISOString();
  const existing = await db
    .prepare('SELECT bot_started FROM known_bot_users WHERE telegram_user_id = ?')
    .bind(user.id)
    .first<{ bot_started: number }>();

  const finalStarted = botStarted || existing?.bot_started === 1 ? 1 : 0;

  await db
    .prepare(
      `INSERT INTO known_bot_users (telegram_user_id, username, first_name, bot_started, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(telegram_user_id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         bot_started = MAX(known_bot_users.bot_started, excluded.bot_started),
         updated_at = excluded.updated_at`
    )
    .bind(user.id, user.username ?? null, formatDisplayName(user), finalStarted, now)
    .run();

  if (finalStarted === 1) {
    await db
      .prepare('UPDATE participants SET bot_reachable = 1 WHERE telegram_user_id = ?')
      .bind(user.id)
      .run();
  }

  return finalStarted === 1;
}

export async function updateBotReachability(
  db: D1Database,
  telegramUserId: number,
  reachable: boolean
): Promise<void> {
  const val = reachable ? 1 : 0;
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare('UPDATE participants SET bot_reachable = ? WHERE telegram_user_id = ?')
      .bind(val, telegramUserId),
    db
      .prepare(
        'UPDATE known_bot_users SET bot_started = ?, updated_at = ? WHERE telegram_user_id = ?'
      )
      .bind(val, now, telegramUserId)
  ]);
}

export async function getWishlistForParticipant(
  db: D1Database,
  participantId: string
): Promise<WishlistItemDto[]> {
  const { results } = await db
    .prepare(
      'SELECT id, title, url, notes, created_at FROM wishlist_items WHERE participant_id = ? ORDER BY position ASC, created_at ASC'
    )
    .bind(participantId)
    .all<Pick<WishlistRow, 'id' | 'title' | 'url' | 'notes' | 'created_at'>>();

  return results.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    notes: r.notes,
    createdAt: r.created_at
  }));
}

export async function sendAssignmentDm(
  env: Env,
  room: RoomRow,
  giver: ParticipantRow,
  isRedraw = false
): Promise<boolean> {
  if (!giver.telegram_user_id || !giver.assigned_to_id) return false;

  const target = await dbGetParticipantById(env.DB, giver.assigned_to_id);
  if (!target) return false;

  const wishlist = await getWishlistForParticipant(env.DB, target.id);
  const html = buildAssignmentMessageHtml({
    roomTitle: room.title,
    targetName: target.display_name,
    targetUsername: target.telegram_username,
    maxBudget: room.max_budget,
    currency: room.currency,
    revealDate: room.reveal_date,
    notes: room.notes,
    sizes: target.sizes,
    allergies: target.allergies,
    dislikes: target.dislikes,
    wishlist,
    isRedraw
  });

  const keyboard = buildStartAppButton(
    env,
    '🎁 Abrir sala y ver lista',
    `join_${room.code}`
  );
  const res = await sendTelegramMessage(env.BOT_TOKEN, giver.telegram_user_id, html, keyboard);

  if (res.ok) {
    await Promise.all([
      updateBotReachability(env.DB, giver.telegram_user_id, true),
      env.DB.prepare('UPDATE participants SET notified_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), giver.id)
        .run()
    ]);
    return true;
  }

  if (res.blocked) {
    await updateBotReachability(env.DB, giver.telegram_user_id, false);
  }
  return false;
}

async function dbGetParticipantById(
  db: D1Database,
  participantId: string
): Promise<ParticipantRow | null> {
  return db
    .prepare('SELECT * FROM participants WHERE id = ?')
    .bind(participantId)
    .first<ParticipantRow>();
}

export async function joinRoomOrClaimSlot(
  env: Env,
  user: TelegramUser,
  target: { roomCode?: string; claimToken?: string }
): Promise<{ ok: true; roomCode: string; claimedSlot: boolean } | { ok: false; status: number; error: string }> {
  const isKnownReachable = await upsertKnownBotUser(env.DB, user, false);
  const displayName = formatDisplayName(user);
  const username = user.username ?? null;

  if (target.claimToken) {
    const slot = await env.DB.prepare('SELECT * FROM participants WHERE claim_token = ?')
      .bind(target.claimToken)
      .first<ParticipantRow>();
    if (!slot) {
      return { ok: false, status: 404, error: 'El enlace de invitación personal no existe o ha caducado.' };
    }

    const room = await env.DB.prepare('SELECT * FROM rooms WHERE id = ?')
      .bind(slot.room_id)
      .first<RoomRow>();
    if (!room) {
      return { ok: false, status: 404, error: 'El sorteo ya no existe.' };
    }

    // Comprobar si este usuario ya está en la sala con otra plaza
    const existingSelf = await env.DB.prepare(
      'SELECT * FROM participants WHERE room_id = ? AND telegram_user_id = ?'
    )
      .bind(room.id, user.id)
      .first<ParticipantRow>();

    if (existingSelf && existingSelf.id !== slot.id) {
      return { ok: true, roomCode: room.code, claimedSlot: false };
    }

    if (slot.telegram_user_id !== null && slot.telegram_user_id !== user.id) {
      return {
        ok: false,
        status: 409,
        error: 'Esta plaza ya fue reclamada por otro usuario de Telegram.'
      };
    }

    const reachableVal = isKnownReachable || slot.bot_reachable === 1 ? 1 : 0;
    await env.DB.prepare(
      `UPDATE participants
       SET telegram_user_id = ?, telegram_username = ?, bot_reachable = ?
       WHERE id = ?`
    )
      .bind(user.id, username, reachableVal, slot.id)
      .run();

    const updatedSlot: ParticipantRow = {
      ...slot,
      telegram_user_id: user.id,
      telegram_username: username,
      bot_reachable: reachableVal
    };

    if (room.status === 'drawn' && updatedSlot.assigned_to_id && !updatedSlot.notified_at && reachableVal === 1) {
      await sendAssignmentDm(env, room, updatedSlot);
    }

    return { ok: true, roomCode: room.code, claimedSlot: true };
  }

  if (target.roomCode) {
    const code = target.roomCode.trim().toUpperCase();
    const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?')
      .bind(code)
      .first<RoomRow>();
    if (!room) {
      return { ok: false, status: 404, error: 'No existe ningún sorteo con ese código.' };
    }

    const existingSelf = await env.DB.prepare(
      'SELECT * FROM participants WHERE room_id = ? AND telegram_user_id = ?'
    )
      .bind(room.id, user.id)
      .first<ParticipantRow>();

    if (existingSelf) {
      await env.DB.prepare(
        `UPDATE participants
         SET telegram_username = ?, bot_reachable = MAX(bot_reachable, ?)
         WHERE id = ?`
      )
        .bind(username, isKnownReachable ? 1 : 0, existingSelf.id)
        .run();
      return { ok: true, roomCode: room.code, claimedSlot: false };
    }

    // Buscar si existe una plaza pre-añadida con ese @username sin reclamar
    if (username) {
      const preAdded = await env.DB.prepare(
        `SELECT * FROM participants
         WHERE room_id = ? AND telegram_user_id IS NULL AND LOWER(telegram_username) = ?`
      )
        .bind(room.id, username.toLowerCase())
        .first<ParticipantRow>();

      if (preAdded) {
        const reachableVal = isKnownReachable ? 1 : 0;
        await env.DB.prepare(
          `UPDATE participants
           SET telegram_user_id = ?, telegram_username = ?, bot_reachable = ?
           WHERE id = ?`
        )
          .bind(user.id, username, reachableVal, preAdded.id)
          .run();

        if (room.status === 'drawn' && preAdded.assigned_to_id && !preAdded.notified_at && reachableVal === 1) {
          await sendAssignmentDm(env, room, {
            ...preAdded,
            telegram_user_id: user.id,
            telegram_username: username,
            bot_reachable: reachableVal
          });
        }
        return { ok: true, roomCode: room.code, claimedSlot: true };
      }
    }

    if (room.status === 'drawn') {
      return {
        ok: false,
        status: 409,
        error: 'Este sorteo ya se ha realizado y no admite nuevos participantes.'
      };
    }

    await env.DB.prepare(
      `INSERT INTO participants
       (id, room_id, telegram_user_id, telegram_username, display_name, claim_token, bot_reachable, is_organizer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    )
      .bind(
        randomId(),
        room.id,
        user.id,
        username,
        displayName,
        randomCode(12),
        isKnownReachable ? 1 : 0,
        new Date().toISOString()
      )
      .run();

    return { ok: true, roomCode: room.code, claimedSlot: false };
  }

  return { ok: false, status: 400, error: 'Falta el código de sala o token de invitación.' };
}

export async function buildRoomDetailDto(
  env: Env,
  room: RoomRow,
  user: TelegramUser
): Promise<RoomDetailDto | null> {
  const { results: participantRows } = await env.DB.prepare(
    'SELECT * FROM participants WHERE room_id = ? ORDER BY is_organizer DESC, created_at ASC'
  )
    .bind(room.id)
    .all<ParticipantRow>();

  const me = participantRows.find((p) => p.telegram_user_id === user.id);
  if (!me) return null;

  const isOrganizer = room.organizer_tg_id === user.id || me.is_organizer === 1;

  const { results: wishCounts } = await env.DB.prepare(
    'SELECT participant_id, COUNT(*) as count FROM wishlist_items WHERE room_id = ? GROUP BY participant_id'
  )
    .bind(room.id)
    .all<{ participant_id: string; count: number }>();

  const countMap = new Map(wishCounts.map((w) => [w.participant_id, w.count]));

  const myWishlist = await getWishlistForParticipant(env.DB, me.id);

  const participants: ParticipantDto[] = participantRows.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    telegramUsername: p.telegram_username,
    hasJoinedTelegram: p.telegram_user_id !== null,
    botReachable: p.bot_reachable === 1,
    isOrganizer: p.is_organizer === 1,
    isMe: p.id === me.id,
    claimToken: isOrganizer && p.telegram_user_id === null ? p.claim_token : null,
    wishlistCount: countMap.get(p.id) ?? 0,
    notifiedAt: p.notified_at
  }));

  const { results: exclusionRows } = await env.DB.prepare(
    'SELECT id, giver_id, excluded_receiver_id FROM exclusions WHERE room_id = ? ORDER BY created_at ASC'
  )
    .bind(room.id)
    .all<ExclusionRow>();

  const exclusions: ExclusionDto[] = exclusionRows.map((e) => ({
    id: e.id,
    giverId: e.giver_id,
    excludedReceiverId: e.excluded_receiver_id
  }));

  const giftsReadyCount = participantRows.filter(
    (p) => p.gift_status === 'bought' || p.gift_status === 'wrapped'
  ).length;

  const isPostDraw = room.status === 'drawn' || room.status === 'revealed';

  async function loadPairMessages(
    giverId: string,
    receiverId: string
  ): Promise<AnonymousMessageDto[]> {
    const { results } = await env.DB.prepare(
      `SELECT id, sender_role, body, created_at
       FROM anonymous_messages
       WHERE room_id = ? AND giver_id = ? AND receiver_id = ?
       ORDER BY created_at ASC`
    )
      .bind(room.id, giverId, receiverId)
      .all<AnonymousMessageRow>();

    return results.map((m) => ({
      id: m.id,
      senderRole: m.sender_role,
      body: m.body,
      createdAt: m.created_at
    }));
  }

  let myTarget: RoomDetailDto['myTarget'] = null;
  if (isPostDraw && me.assigned_to_id) {
    const targetRow = participantRows.find((p) => p.id === me.assigned_to_id);
    if (targetRow) {
      const [targetWishlist, chatMessages] = await Promise.all([
        getWishlistForParticipant(env.DB, targetRow.id),
        loadPairMessages(me.id, targetRow.id)
      ]);
      myTarget = {
        participantId: targetRow.id,
        displayName: targetRow.display_name,
        telegramUsername: targetRow.telegram_username,
        sizes: targetRow.sizes ?? '',
        allergies: targetRow.allergies ?? '',
        dislikes: targetRow.dislikes ?? '',
        wishlist: targetWishlist,
        chatMessages
      };
    }
  }

  let santaMessages: AnonymousMessageDto[] = [];
  if (isPostDraw) {
    const mySanta = participantRows.find((p) => p.assigned_to_id === me.id);
    if (mySanta) {
      santaMessages = await loadPairMessages(mySanta.id, me.id);
    }
  }

  let revealedPairs: RevealedPairDto[] | null = null;
  if (room.status === 'revealed') {
    const byId = new Map(participantRows.map((p) => [p.id, p]));
    revealedPairs = participantRows
      .filter((p) => p.assigned_to_id && byId.has(p.assigned_to_id))
      .map((p) => ({
        giverName: p.display_name,
        receiverName: byId.get(p.assigned_to_id!)!.display_name
      }));
  }

  const summary: RoomSummaryDto = {
    id: room.id,
    code: room.code,
    title: room.title,
    maxBudget: room.max_budget,
    currency: room.currency,
    revealDate: room.reveal_date,
    notes: room.notes,
    status: room.status,
    participantCount: participantRows.length,
    giftsReadyCount,
    isOrganizer,
    myBotReachable: me.bot_reachable === 1,
    drawnAt: room.drawn_at,
    revealedAt: room.revealed_at
  };

  return {
    room: summary,
    me: {
      participantId: me.id,
      displayName: me.display_name,
      botReachable: me.bot_reachable === 1,
      sizes: me.sizes ?? '',
      allergies: me.allergies ?? '',
      dislikes: me.dislikes ?? '',
      giftStatus: me.gift_status || 'pending',
      wishlist: myWishlist
    },
    participants,
    exclusions,
    myTarget,
    santaMessages,
    revealedPairs,
    botUsername: normalizeBotUsername(env.BOT_USERNAME)
  };
}

export async function notifyGiverOfPreferencesChange(
  env: Env,
  room: RoomRow,
  receiver: ParticipantRow
): Promise<void> {
  if (room.status !== 'drawn') return;

  const giver = await env.DB.prepare(
    'SELECT * FROM participants WHERE room_id = ? AND assigned_to_id = ?'
  )
    .bind(room.id, receiver.id)
    .first<ParticipantRow>();

  if (!giver || !giver.telegram_user_id) return;

  const lines = [
    `📝 <b>¡Preferencias actualizadas!</b>`,
    '',
    `<b>${escapeHtml(receiver.display_name)}</b> ha actualizado su perfil de gustos (tallas, alergias o qué evitar) para <b>«${escapeHtml(room.title)}»</b>.`,
    ''
  ];
  if (receiver.sizes.trim()) {
    lines.push(`📏 <b>Tallas:</b> ${escapeHtml(receiver.sizes.trim())}`);
  }
  if (receiver.allergies.trim()) {
    lines.push(`⚠️ <b>Alergias:</b> ${escapeHtml(receiver.allergies.trim())}`);
  }
  if (receiver.dislikes.trim()) {
    lines.push(`🚫 <b>Evitar / No regalar:</b> ${escapeHtml(receiver.dislikes.trim())}`);
  }

  const res = await sendTelegramMessage(
    env.BOT_TOKEN,
    giver.telegram_user_id,
    lines.join('\n'),
    buildStartAppButton(env, '👀 Ver en la Mini App', `join_${room.code}`)
  );

  if (res.ok) {
    await updateBotReachability(env.DB, giver.telegram_user_id, true);
  } else if (res.blocked) {
    await updateBotReachability(env.DB, giver.telegram_user_id, false);
  }
}

export async function notifyGiverOfWishlistChange(
  env: Env,
  room: RoomRow,
  receiver: ParticipantRow
): Promise<void> {
  if (room.status !== 'drawn') return;

  const giver = await env.DB.prepare(
    'SELECT * FROM participants WHERE room_id = ? AND assigned_to_id = ?'
  )
    .bind(room.id, receiver.id)
    .first<ParticipantRow>();

  if (!giver || !giver.telegram_user_id) return;

  const wishlist = await getWishlistForParticipant(env.DB, receiver.id);
  const lines = [
    `🎁 <b>¡Lista de regalos actualizada!</b>`,
    '',
    `<b>${escapeHtml(receiver.display_name)}</b> ha actualizado sus preferencias de regalo para <b>«${escapeHtml(room.title)}»</b>.`,
    ''
  ];

  if (wishlist.length > 0) {
    lines.push('✨ <b>Lista actual:</b>');
    for (const item of wishlist.slice(0, 8)) {
      let line = `• <b>${escapeHtml(item.title)}</b>`;
      if (item.notes) line += ` — <i>${escapeHtml(item.notes)}</i>`;
      lines.push(line);
    }
    if (wishlist.length > 8) {
      lines.push(`… y ${wishlist.length - 8} ideas más en la Mini App.`);
    }
  } else {
    lines.push('<i>Su lista está vacía en este momento.</i>');
  }

  const res = await sendTelegramMessage(
    env.BOT_TOKEN,
    giver.telegram_user_id,
    lines.join('\n'),
    buildStartAppButton(env, '👀 Ver en la Mini App', `join_${room.code}`)
  );

  if (res.ok) {
    await updateBotReachability(env.DB, giver.telegram_user_id, true);
  } else if (res.blocked) {
    await updateBotReachability(env.DB, giver.telegram_user_id, false);
  }
}
