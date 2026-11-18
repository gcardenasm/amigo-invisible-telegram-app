import { computeSecretSantaDraw } from '../shared/draw';
import type { RoomSummaryDto } from '../shared/types';
import { authenticateRequest, formatDisplayName } from './auth';
import {
  buildRoomDetailDto,
  buildStartAppButton,
  joinRoomOrClaimSlot,
  notifyGiverOfWishlistChange,
  randomCode,
  randomId,
  sanitizeUrl,
  sendAssignmentDm,
  updateBotReachability,
  upsertKnownBotUser,
  type ParticipantRow,
  type RoomRow
} from './db';
import type { Env, TelegramUser } from './env';
import { escapeHtml, formatRevealDate, sendTelegramMessage } from './telegram';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function badRequest(error: string, status = 400): Response {
  return json({ error }, status);
}

async function parseBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function getRoomAndMember(
  env: Env,
  code: string,
  user: TelegramUser
): Promise<{ room: RoomRow; me: ParticipantRow } | Response> {
  const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?')
    .bind(code.trim().toUpperCase())
    .first<RoomRow>();
  if (!room) {
    return badRequest('No se encontró ese sorteo.', 404);
  }

  const me = await env.DB.prepare(
    'SELECT * FROM participants WHERE room_id = ? AND telegram_user_id = ?'
  )
    .bind(room.id, user.id)
    .first<ParticipantRow>();
  if (!me) {
    return badRequest('No perteneces a este sorteo.', 403);
  }

  return { room, me };
}

export async function handleApiRequest(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  if (pathname === '/api/health') {
    return json({ ok: true });
  }

  const user = await authenticateRequest(request, env);
  if (!user) {
    return badRequest('No se pudo validar tu sesión de Telegram. Ábrelo desde el bot.', 401);
  }

  const method = request.method.toUpperCase();

  // GET /api/me
  if (method === 'GET' && pathname === '/api/me') {
    const botReachable = await upsertKnownBotUser(env.DB, user, false);
    return json({
      user: {
        id: user.id,
        displayName: formatDisplayName(user),
        username: user.username ?? null
      },
      botUsername: env.BOT_USERNAME,
      botReachable,
      devMode: env.DEV_MODE === 'true'
    });
  }

  // POST /api/bot/ping
  if (method === 'POST' && pathname === '/api/bot/ping') {
    const body = await parseBody<{ roomCode?: string }>(request);
    const roomCode = body?.roomCode?.trim().toUpperCase();
    const res = await sendTelegramMessage(
      env.BOT_TOKEN,
      user.id,
      '✅ <b>¡Avisos del bot activados!</b>\n\nPor aquí te diré quién es tu Amigo Invisible y te avisaré si actualiza su lista de regalos.',
      roomCode ? buildStartAppButton(env, '🎁 Volver al sorteo', `join_${roomCode}`) : undefined
    );

    if (res.ok) {
      await updateBotReachability(env.DB, user.id, true);
      // Si tenía algún sorteo ya realizado pendiente de notificar, enviarlo ahora
      const { results: pending } = await env.DB.prepare(
        `SELECT p.*, r.code as r_code, r.title as r_title, r.max_budget as r_max_budget,
                r.currency as r_currency, r.reveal_date as r_reveal_date, r.notes as r_notes,
                r.organizer_tg_id as r_organizer_tg_id, r.status as r_status, r.drawn_at as r_drawn_at,
                r.created_at as r_created_at, r.updated_at as r_updated_at
         FROM participants p
         INNER JOIN rooms r ON r.id = p.room_id
         WHERE p.telegram_user_id = ? AND r.status = 'drawn' AND p.assigned_to_id IS NOT NULL AND p.notified_at IS NULL`
      )
        .bind(user.id)
        .all<
          ParticipantRow & {
            r_code: string;
            r_title: string;
            r_max_budget: number | null;
            r_currency: string;
            r_reveal_date: string;
            r_notes: string;
            r_organizer_tg_id: number;
            r_status: 'open' | 'drawn';
            r_drawn_at: string | null;
            r_created_at: string;
            r_updated_at: string;
          }
        >();

      for (const row of pending) {
        await sendAssignmentDm(
          env,
          {
            id: row.room_id,
            code: row.r_code,
            title: row.r_title,
            max_budget: row.r_max_budget,
            currency: row.r_currency,
            reveal_date: row.r_reveal_date,
            notes: row.r_notes,
            organizer_tg_id: row.r_organizer_tg_id,
            status: row.r_status,
            drawn_at: row.r_drawn_at,
            created_at: row.r_created_at,
            updated_at: row.r_updated_at
          },
          row
        );
      }

      return json({ reachable: true });
    }

    if (res.blocked) {
      await updateBotReachability(env.DB, user.id, false);
    }
    return json({ reachable: false, error: res.description });
  }

  // GET /api/rooms
  if (method === 'GET' && pathname === '/api/rooms') {
    await upsertKnownBotUser(env.DB, user, false);
    const { results } = await env.DB.prepare(
      `SELECT r.*, p.is_organizer as me_org, p.bot_reachable as me_bot,
              (SELECT COUNT(*) FROM participants p2 WHERE p2.room_id = r.id) as participant_count
       FROM rooms r
       INNER JOIN participants p ON p.room_id = r.id
       WHERE p.telegram_user_id = ?
       ORDER BY r.reveal_date ASC, r.created_at DESC`
    )
      .bind(user.id)
      .all<RoomRow & { me_org: number; me_bot: number; participant_count: number }>();

    const rooms: RoomSummaryDto[] = results.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      maxBudget: r.max_budget,
      currency: r.currency,
      revealDate: r.reveal_date,
      notes: r.notes,
      status: r.status,
      participantCount: r.participant_count,
      isOrganizer: r.organizer_tg_id === user.id || r.me_org === 1,
      myBotReachable: r.me_bot === 1,
      drawnAt: r.drawn_at
    }));

    return json({ rooms });
  }

  // POST /api/rooms
  if (method === 'POST' && pathname === '/api/rooms') {
    const body = await parseBody<{
      title?: string;
      maxBudget?: number | null;
      currency?: string;
      revealDate?: string;
      notes?: string;
    }>(request);

    const title = (body?.title ?? '').trim();
    const revealDate = (body?.revealDate ?? '').trim();
    const currency = (body?.currency ?? 'EUR').trim().slice(0, 6) || 'EUR';
    const notes = (body?.notes ?? '').trim().slice(0, 500);
    const maxBudget =
      body?.maxBudget === null || body?.maxBudget === undefined || body?.maxBudget === ('' as unknown)
        ? null
        : Number(body.maxBudget);

    if (title.length < 2 || title.length > 80) {
      return badRequest('El nombre del sorteo debe tener entre 2 y 80 caracteres.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revealDate)) {
      return badRequest('Indica una fecha de revelación válida (AAAA-MM-DD).');
    }
    if (maxBudget !== null && (!Number.isFinite(maxBudget) || maxBudget <= 0 || maxBudget > 1_000_000)) {
      return badRequest('El importe máximo debe ser un número positivo.');
    }

    const botReachable = await upsertKnownBotUser(env.DB, user, false);
    const now = new Date().toISOString();
    const roomId = randomId();
    const code = randomCode(8);
    const participantId = randomId();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO rooms
         (id, code, title, max_budget, currency, reveal_date, notes, organizer_tg_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      ).bind(roomId, code, title, maxBudget, currency, revealDate, notes, user.id, now, now),
      env.DB.prepare(
        `INSERT INTO participants
         (id, room_id, telegram_user_id, telegram_username, display_name, claim_token, bot_reachable, is_organizer, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      ).bind(
        participantId,
        roomId,
        user.id,
        user.username ?? null,
        formatDisplayName(user),
        randomCode(12),
        botReachable ? 1 : 0,
        now
      )
    ]);

    return json({ code }, 201);
  }

  // POST /api/rooms/join
  if (method === 'POST' && pathname === '/api/rooms/join') {
    const body = await parseBody<{ roomCode?: string; claimToken?: string }>(request);
    const res = await joinRoomOrClaimSlot(env, user, {
      roomCode: body?.roomCode,
      claimToken: body?.claimToken
    });
    if (!res.ok) {
      return badRequest(res.error, res.status);
    }
    return json({ code: res.roomCode, claimedSlot: res.claimedSlot });
  }

  // Rutas con :code -> /api/rooms/:code/...
  const match = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)(\/.*)?$/);
  if (!match) {
    return badRequest('Ruta no encontrada.', 404);
  }

  const code = match[1]!.toUpperCase();
  const subpath = match[2] ?? '';

  const ctx = await getRoomAndMember(env, code, user);
  if (ctx instanceof Response) return ctx;
  const { room, me } = ctx;
  const isOrganizer = room.organizer_tg_id === user.id || me.is_organizer === 1;

  // GET /api/rooms/:code
  if (method === 'GET' && subpath === '') {
    const detail = await buildRoomDetailDto(env, room, user);
    if (!detail) return badRequest('No autorizado.', 403);
    return json(detail);
  }

  // PATCH /api/rooms/:code
  if (method === 'PATCH' && subpath === '') {
    if (!isOrganizer) {
      return badRequest('Solo quien organiza puede editar el sorteo.', 403);
    }
    const body = await parseBody<{
      title?: string;
      maxBudget?: number | null;
      currency?: string;
      revealDate?: string;
      notes?: string;
    }>(request);

    const title = body?.title !== undefined ? body.title.trim() : room.title;
    const revealDate = body?.revealDate !== undefined ? body.revealDate.trim() : room.reveal_date;
    const currency =
      body?.currency !== undefined ? body.currency.trim().slice(0, 6) || 'EUR' : room.currency;
    const notes = body?.notes !== undefined ? body.notes.trim().slice(0, 500) : room.notes;
    const maxBudget =
      body?.maxBudget !== undefined
        ? body.maxBudget === null
          ? null
          : Number(body.maxBudget)
        : room.max_budget;

    if (title.length < 2 || title.length > 80) {
      return badRequest('El nombre del sorteo debe tener entre 2 y 80 caracteres.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revealDate)) {
      return badRequest('Fecha de revelación inválida.');
    }
    if (maxBudget !== null && (!Number.isFinite(maxBudget) || maxBudget <= 0 || maxBudget > 1_000_000)) {
      return badRequest('El importe máximo debe ser positivo.');
    }

    await env.DB.prepare(
      `UPDATE rooms
       SET title = ?, max_budget = ?, currency = ?, reveal_date = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(title, maxBudget, currency, revealDate, notes, new Date().toISOString(), room.id)
      .run();

    return json({ ok: true });
  }

  // DELETE /api/rooms/:code
  if (method === 'DELETE' && subpath === '') {
    if (!isOrganizer) {
      return badRequest('Solo quien organiza puede eliminar el sorteo.', 403);
    }
    await env.DB.prepare('DELETE FROM rooms WHERE id = ?').bind(room.id).run();
    return json({ ok: true });
  }

  // POST /api/rooms/:code/participants (pre-añadir contacto manual)
  if (method === 'POST' && subpath === '/participants') {
    if (!isOrganizer) {
      return badRequest('Solo quien organiza puede añadir participantes manualmente.', 403);
    }
    if (room.status === 'drawn') {
      return badRequest('El sorteo ya se ha realizado. Para añadir participantes, vuelve a abrir o re-sortear primero.', 409);
    }

    const body = await parseBody<{ displayName?: string; telegramUsername?: string }>(request);
    const displayName = (body?.displayName ?? '').trim();
    const rawUsername = (body?.telegramUsername ?? '').trim().replace(/^@/, '').toLowerCase();
    const telegramUsername = rawUsername || null;

    if (displayName.length < 1 || displayName.length > 60) {
      return badRequest('El nombre del contacto debe tener entre 1 y 60 caracteres.');
    }
    if (telegramUsername && !/^[a-z0-9_]{3,32}$/i.test(telegramUsername)) {
      return badRequest('El @usuario de Telegram no parece válido.');
    }

    if (telegramUsername) {
      const duplicate = await env.DB.prepare(
        'SELECT id FROM participants WHERE room_id = ? AND LOWER(telegram_username) = ?'
      )
        .bind(room.id, telegramUsername)
        .first();
      if (duplicate) {
        return badRequest(`@${telegramUsername} ya está en la lista de este sorteo.`, 409);
      }
    }

    const participantId = randomId();
    const claimToken = randomCode(12);
    await env.DB.prepare(
      `INSERT INTO participants
       (id, room_id, telegram_user_id, telegram_username, display_name, claim_token, bot_reachable, is_organizer, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, 0, 0, ?)`
    )
      .bind(
        participantId,
        room.id,
        telegramUsername,
        displayName,
        claimToken,
        new Date().toISOString()
      )
      .run();

    return json({ id: participantId, claimToken }, 201);
  }

  // DELETE /api/rooms/:code/participants/:id
  const participantDeleteMatch = subpath.match(/^\/participants\/([^/]+)$/);
  if (method === 'DELETE' && participantDeleteMatch) {
    if (!isOrganizer) {
      return badRequest('Solo quien organiza puede eliminar participantes.', 403);
    }
    if (room.status === 'drawn') {
      return badRequest('No puedes eliminar participantes con el sorteo ya cerrado.', 409);
    }
    const targetId = participantDeleteMatch[1]!;
    if (targetId === me.id) {
      return badRequest('No puedes eliminarte a ti mismo siendo organizador.');
    }
    await env.DB.prepare('DELETE FROM participants WHERE id = ? AND room_id = ? AND is_organizer = 0')
      .bind(targetId, room.id)
      .run();
    return json({ ok: true });
  }

  // POST /api/rooms/:code/wishlist
  if (method === 'POST' && subpath === '/wishlist') {
    const body = await parseBody<{ title?: string; url?: string; notes?: string }>(request);
    const title = (body?.title ?? '').trim();
    const url = sanitizeUrl(body?.url ?? '');
    const notes = (body?.notes ?? '').trim().slice(0, 200);

    if (title.length < 1 || title.length > 120) {
      return badRequest('Escribe un título de regalo (1-120 caracteres).');
    }

    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) as total FROM wishlist_items WHERE participant_id = ?'
    )
      .bind(me.id)
      .first<{ total: number }>();

    if ((countRow?.total ?? 0) >= 25) {
      return badRequest('Puedes añadir hasta 25 ideas en tu lista.');
    }

    const itemId = randomId();
    await env.DB.prepare(
      `INSERT INTO wishlist_items (id, participant_id, room_id, title, url, notes, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        itemId,
        me.id,
        room.id,
        title,
        url,
        notes,
        countRow?.total ?? 0,
        new Date().toISOString()
      )
      .run();

    await notifyGiverOfWishlistChange(env, room, me);
    return json({ id: itemId }, 201);
  }

  // PUT /api/rooms/:code/wishlist/:itemId
  const wishMatch = subpath.match(/^\/wishlist\/([^/]+)$/);
  if (method === 'PUT' && wishMatch) {
    const itemId = wishMatch[1]!;
    const body = await parseBody<{ title?: string; url?: string; notes?: string }>(request);
    const title = (body?.title ?? '').trim();
    const url = sanitizeUrl(body?.url ?? '');
    const notes = (body?.notes ?? '').trim().slice(0, 200);

    if (title.length < 1 || title.length > 120) {
      return badRequest('Escribe un título de regalo (1-120 caracteres).');
    }

    const res = await env.DB.prepare(
      'UPDATE wishlist_items SET title = ?, url = ?, notes = ? WHERE id = ? AND participant_id = ?'
    )
      .bind(title, url, notes, itemId, me.id)
      .run();

    if ((res.meta.changes ?? 0) === 0) {
      return badRequest('No se encontró ese regalo en tu lista.', 404);
    }

    await notifyGiverOfWishlistChange(env, room, me);
    return json({ ok: true });
  }

  // DELETE /api/rooms/:code/wishlist/:itemId
  if (method === 'DELETE' && wishMatch) {
    const itemId = wishMatch[1]!;
    const res = await env.DB.prepare(
      'DELETE FROM wishlist_items WHERE id = ? AND participant_id = ?'
    )
      .bind(itemId, me.id)
      .run();

    if ((res.meta.changes ?? 0) === 0) {
      return badRequest('No se encontró ese regalo en tu lista.', 404);
    }

    await notifyGiverOfWishlistChange(env, room, me);
    return json({ ok: true });
  }

  // POST /api/rooms/:code/exclusions
  if (method === 'POST' && subpath === '/exclusions') {
    if (!isOrganizer) {
      return badRequest('Solo quien organiza puede configurar exclusiones.', 403);
    }
    if (room.status === 'drawn') {
      return badRequest('No puedes cambiar exclusiones con el sorteo ya realizado sin re-sortear.', 409);
    }

    const body = await parseBody<{
      giverId?: string;
      excludedReceiverId?: string;
      mutual?: boolean;
    }>(request);

    const giverId = (body?.giverId ?? '').trim();
    const excludedId = (body?.excludedReceiverId ?? '').trim();
    const mutual = body?.mutual !== false;

    if (!giverId || !excludedId || giverId === excludedId) {
      return badRequest('Selecciona dos participantes distintos para la exclusión.');
    }

    const { results: validMembers } = await env.DB.prepare(
      'SELECT id FROM participants WHERE room_id = ? AND id IN (?, ?)'
    )
      .bind(room.id, giverId, excludedId)
      .all<{ id: string }>();

    if (validMembers.length !== 2) {
      return badRequest('Alguno de los participantes seleccionados no pertenece a la sala.');
    }

    const now = new Date().toISOString();
    const statements = [
      env.DB.prepare(
        `INSERT OR IGNORE INTO exclusions (id, room_id, giver_id, excluded_receiver_id, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(randomId(), room.id, giverId, excludedId, now)
    ];

    if (mutual) {
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO exclusions (id, room_id, giver_id, excluded_receiver_id, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(randomId(), room.id, excludedId, giverId, now)
      );
    }

    await env.DB.batch(statements);
    return json({ ok: true }, 201);
  }

  // DELETE /api/rooms/:code/exclusions/:exclusionId
  const exclusionDeleteMatch = subpath.match(/^\/exclusions\/([^/]+)$/);
  if (method === 'DELETE' && exclusionDeleteMatch) {
    if (!isOrganizer) {
      return badRequest('Solo quien organiza puede eliminar exclusiones.', 403);
    }
    if (room.status === 'drawn') {
      return badRequest('El sorteo ya está realizado.', 409);
    }
    await env.DB.prepare('DELETE FROM exclusions WHERE id = ? AND room_id = ?')
      .bind(exclusionDeleteMatch[1]!, room.id)
      .run();
    return json({ ok: true });
  }

  // POST /api/rooms/:code/draw
  if (method === 'POST' && subpath === '/draw') {
    if (!isOrganizer) {
      return badRequest('Solo quien organiza puede realizar el sorteo.', 403);
    }

    const body = await parseBody<{ redraw?: boolean }>(request);
    const isRedraw = room.status === 'drawn' && body?.redraw === true;
    if (room.status === 'drawn' && !isRedraw) {
      return badRequest('Este sorteo ya se ha realizado.', 409);
    }

    const { results: participants } = await env.DB.prepare(
      'SELECT * FROM participants WHERE room_id = ?'
    )
      .bind(room.id)
      .all<ParticipantRow>();

    const { results: exclusionRows } = await env.DB.prepare(
      'SELECT giver_id, excluded_receiver_id FROM exclusions WHERE room_id = ?'
    )
      .bind(room.id)
      .all<{ giver_id: string; excluded_receiver_id: string }>();

    const drawResult = computeSecretSantaDraw(
      participants.map((p) => p.id),
      exclusionRows.map((e) => ({
        giverId: e.giver_id,
        excludedReceiverId: e.excluded_receiver_id
      }))
    );

    if (!drawResult.ok) {
      return badRequest(drawResult.error, 400);
    }

    const now = new Date().toISOString();
    const updates: D1PreparedStatement[] = [
      env.DB.prepare(
        "UPDATE rooms SET status = 'drawn', drawn_at = ?, updated_at = ? WHERE id = ?"
      ).bind(now, now, room.id)
    ];

    for (const p of participants) {
      const targetId = drawResult.assignments[p.id]!;
      updates.push(
        env.DB.prepare(
          'UPDATE participants SET assigned_to_id = ?, notified_at = NULL WHERE id = ?'
        ).bind(targetId, p.id)
      );
      p.assigned_to_id = targetId;
      p.notified_at = null;
    }

    await env.DB.batch(updates);

    const updatedRoom: RoomRow = { ...room, status: 'drawn', drawn_at: now, updated_at: now };
    let notifiedCount = 0;
    const pendingParticipants: string[] = [];

    for (const giver of participants) {
      const sent = await sendAssignmentDm(env, updatedRoom, giver, isRedraw);
      if (sent) {
        notifiedCount++;
      } else {
        pendingParticipants.push(giver.display_name);
      }
    }

    return json({
      ok: true,
      notifiedCount,
      totalParticipants: participants.length,
      pendingParticipants
    });
  }

  // POST /api/rooms/:code/remind
  if (method === 'POST' && subpath === '/remind') {
    if (!isOrganizer) {
      return badRequest('Solo quien organiza puede enviar recordatorios.', 403);
    }

    const { results: participants } = await env.DB.prepare(
      'SELECT * FROM participants WHERE room_id = ?'
    )
      .bind(room.id)
      .all<ParticipantRow>();

    const { results: wishCounts } = await env.DB.prepare(
      'SELECT participant_id, COUNT(*) as count FROM wishlist_items WHERE room_id = ? GROUP BY participant_id'
    )
      .bind(room.id)
      .all<{ participant_id: string; count: number }>();

    const wishMap = new Map(wishCounts.map((w) => [w.participant_id, w.count]));
    let sentCount = 0;
    const unreachableNames: string[] = [];

    for (const p of participants) {
      if (p.telegram_user_id === null) {
        unreachableNames.push(p.display_name);
        continue;
      }

      // Si ya se sorteó y no le había llegado su DM, enviárselo ahora
      if (room.status === 'drawn' && p.assigned_to_id && !p.notified_at) {
        const sent = await sendAssignmentDm(env, room, p);
        if (sent) sentCount++;
        else unreachableNames.push(p.display_name);
        continue;
      }

      // Si le faltan regalos en su lista, enviar recordatorio
      const count = wishMap.get(p.id) ?? 0;
      if (count === 0) {
        const res = await sendTelegramMessage(
          env.BOT_TOKEN,
          p.telegram_user_id,
          [
            `⏰ <b>Recordatorio de «${escapeHtml(room.title)}»</b>`,
            '',
            `¡Hola ${escapeHtml(p.display_name)}! Aún no has añadido ideas a tu lista de preferencias de regalo.`,
            `📅 Día de revelación: <b>${escapeHtml(formatRevealDate(room.reveal_date))}</b>`,
            '',
            'Entra en la Mini App y añade al menos 2-3 ideas para ayudar a tu Amigo Invisible:'
          ].join('\n'),
          buildStartAppButton(env, '📝 Añadir mi lista de regalos', `join_${room.code}`)
        );
        if (res.ok) {
          sentCount++;
          await updateBotReachability(env.DB, p.telegram_user_id, true);
        } else {
          unreachableNames.push(p.display_name);
          if (res.blocked) await updateBotReachability(env.DB, p.telegram_user_id, false);
        }
      }
    }

    return json({ sentCount, unreachableNames });
  }

  return badRequest('Operación no soportada.', 404);
}
