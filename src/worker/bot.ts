import {
  buildGroupAppButton,
  buildStartAppButton,
  joinRoomOrClaimSlot,
  sendAssignmentDm,
  sendGroupStatusAnnouncement,
  upsertKnownBotUser,
  type ParticipantRow,
  type RoomRow
} from './db';
import type { Env, TelegramUser } from './env';
import {
  answerCallbackQuery,
  answerInlineQuery,
  buildInviteMessageHtml,
  buildInviteStartAppUrl,
  escapeHtml,
  formatBudget,
  formatRevealDate,
  sendTelegramMessage,
  type InlineQueryArticle
} from './telegram';

interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot?: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
    };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    data?: string;
  };
  inline_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    query: string;
  };
}

function mapTgFrom(from: NonNullable<TgUpdate['message']>['from']): TelegramUser | null {
  if (!from || from.is_bot) return null;
  return {
    id: from.id,
    firstName: from.first_name,
    lastName: from.last_name,
    username: from.username?.replace(/^@/, '').toLowerCase(),
    languageCode: from.language_code
  };
}

export async function handleTelegramWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  if (env.WEBHOOK_SECRET) {
    const token = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (token !== env.WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  if (update.callback_query) {
    await answerCallbackQuery(env.BOT_TOKEN, update.callback_query.id);
    return new Response('ok');
  }

  if (update.inline_query) {
    const iq = update.inline_query;
    const { results: userRooms } = await env.DB.prepare(
      `SELECT r.* FROM rooms r
       INNER JOIN participants p ON p.room_id = r.id
       WHERE p.telegram_user_id = ?
       ORDER BY r.updated_at DESC
       LIMIT 10`
    )
      .bind(iq.from.id)
      .all<RoomRow>();

    const q = iq.query.trim().toLowerCase();
    const filtered = q
      ? userRooms.filter(
          (r) => r.title.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
        )
      : userRooms;

    const articles: InlineQueryArticle[] = filtered.map((r) => ({
      type: 'article',
      id: `room_${r.code}`,
      title: `🎅 Invitar a «${r.title}»`,
      description: `Máx: ${formatBudget(r.max_budget, r.currency)} · Día: ${formatRevealDate(
        r.reveal_date
      )}`,
      input_message_content: {
        message_text: buildInviteMessageHtml({
          roomTitle: r.title,
          maxBudget: r.max_budget,
          currency: r.currency,
          revealDate: r.reveal_date,
          notes: r.notes
        }),
        parse_mode: 'HTML',
        disable_web_page_preview: true
      },
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🎁 Abrir y unirme al sorteo',
              url: buildInviteStartAppUrl(env.BOT_USERNAME, `join_${r.code}`)
            }
          ]
        ]
      }
    }));

    await answerInlineQuery(env.BOT_TOKEN, iq.id, articles);
    return new Response('ok');
  }

  const msg = update.message;
  if (!msg || !msg.from) {
    return new Response('ok');
  }

  const text = (msg.text ?? '').trim();
  const [commandRaw, payloadRaw] = text.split(/\s+/, 2);
  const command = (commandRaw ?? '').split('@')[0]?.toLowerCase() ?? '';
  const payload = (payloadRaw ?? '').trim();

  // Comandos dentro de un grupo de Telegram (requiere Allow Groups activado en @BotFather)
  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    if (command === '/vincular') {
      const code = payload.toUpperCase();
      if (!code) {
        await sendTelegramMessage(
          env.BOT_TOKEN,
          msg.chat.id,
          'ℹ️ Indica el código del sorteo para vincular este grupo. Ejemplo:\n<code>/vincular A7K9M2P4</code>'
        );
        return new Response('ok');
      }

      const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?')
        .bind(code)
        .first<RoomRow>();
      if (!room) {
        await sendTelegramMessage(
          env.BOT_TOKEN,
          msg.chat.id,
          `⚠️ No existe ningún sorteo con el código <code>${escapeHtml(code)}</code>.`
        );
        return new Response('ok');
      }

      if (room.organizer_tg_id !== msg.from.id) {
        await sendTelegramMessage(
          env.BOT_TOKEN,
          msg.chat.id,
          '⛔ Solo la persona que creó el sorteo puede vincularlo a este grupo.'
        );
        return new Response('ok');
      }

      const groupTitle = (msg.chat.title ?? 'Grupo de Telegram').slice(0, 80);
      await env.DB.prepare(
        'UPDATE rooms SET linked_group_id = ?, linked_group_title = ?, updated_at = ? WHERE id = ?'
      )
        .bind(msg.chat.id, groupTitle, new Date().toISOString(), room.id)
        .run();

      await sendTelegramMessage(
        env.BOT_TOKEN,
        msg.chat.id,
        [
          `✅ <b>¡Grupo vinculado al Amigo Invisible «${escapeHtml(room.title)}»!</b>`,
          '',
          'Por aquí os avisaré de la cuenta atrás, de quién falta por añadir su lista y de la revelación final.',
          'Podéis consultar quién falta en cualquier momento escribiendo <code>/estado</code>.'
        ].join('\n'),
        buildGroupAppButton(env, '🎁 Abrir y unirme al sorteo', `join_${room.code}`)
      );
      return new Response('ok');
    }

    if (command === '/desvincular') {
      const room = await env.DB.prepare('SELECT * FROM rooms WHERE linked_group_id = ?')
        .bind(msg.chat.id)
        .first<RoomRow>();
      if (!room) {
        return new Response('ok');
      }
      if (room.organizer_tg_id !== msg.from.id) {
        await sendTelegramMessage(
          env.BOT_TOKEN,
          msg.chat.id,
          '⛔ Solo quien organiza el sorteo puede desvincular este grupo.'
        );
        return new Response('ok');
      }
      await env.DB.prepare(
        "UPDATE rooms SET linked_group_id = NULL, linked_group_title = '', updated_at = ? WHERE id = ?"
      )
        .bind(new Date().toISOString(), room.id)
        .run();
      await sendTelegramMessage(
        env.BOT_TOKEN,
        msg.chat.id,
        `🔓 Grupo desvinculado de «${escapeHtml(room.title)}».`
      );
      return new Response('ok');
    }

    if (command === '/estado' || command === '/pendientes' || command === '/recordar') {
      const room = await env.DB.prepare(
        'SELECT * FROM rooms WHERE linked_group_id = ? ORDER BY updated_at DESC LIMIT 1'
      )
        .bind(msg.chat.id)
        .first<RoomRow>();
      if (!room) {
        await sendTelegramMessage(
          env.BOT_TOKEN,
          msg.chat.id,
          'ℹ️ Este grupo aún no está vinculado a ningún sorteo. El organizador puede vincularlo escribiendo <code>/vincular CODIGO</code>.'
        );
        return new Response('ok');
      }
      await sendGroupStatusAnnouncement(env, room);
      return new Response('ok');
    }

    return new Response('ok');
  }

  if (msg.chat.type !== 'private') {
    return new Response('ok');
  }

  const tgUser = mapTgFrom(msg.from);
  if (!tgUser) {
    return new Response('ok');
  }

  // Cualquier mensaje privado al bot significa que podemos escribirle
  await upsertKnownBotUser(env.DB, tgUser, true);

  if (command === '/start' && payload) {
    if (payload.startsWith('join_')) {
      const roomCode = payload.slice(5);
      const joined = await joinRoomOrClaimSlot(env, tgUser, { roomCode });
      if (joined.ok) {
        const room = await env.DB.prepare('SELECT * FROM rooms WHERE code = ?')
          .bind(joined.roomCode)
          .first<RoomRow>();
        if (room) {
          await sendTelegramMessage(
            env.BOT_TOKEN,
            tgUser.id,
            [
              `🎄 <b>¡Te has unido a «${escapeHtml(room.title)}»!</b>`,
              `💰 Importe máximo: <b>${escapeHtml(formatBudget(room.max_budget, room.currency))}</b>`,
              `📅 Día de revelación: <b>${escapeHtml(formatRevealDate(room.reveal_date))}</b>`,
              '',
              'Pulsa el botón para añadir tu lista de deseos y ver los participantes:'
            ].join('\n'),
            buildStartAppButton(env, '🎁 Abrir sala del sorteo', `join_${room.code}`)
          );
          return new Response('ok');
        }
      } else {
        await sendTelegramMessage(
          env.BOT_TOKEN,
          tgUser.id,
          `⚠️ ${escapeHtml(joined.error)}`,
          [[{ text: '🎄 Abrir Amigo Invisible', web_app: { url: env.WEBAPP_URL } }]]
        );
        return new Response('ok');
      }
    }

    if (payload.startsWith('claim_')) {
      const claimToken = payload.slice(6);
      const claimed = await joinRoomOrClaimSlot(env, tgUser, { claimToken });
      if (claimed.ok) {
        await sendTelegramMessage(
          env.BOT_TOKEN,
          tgUser.id,
          '✅ <b>¡Plaza vinculada correctamente!</b>\n\nYa estás conectado con el bot. Añade tus preferencias de regalo en la Mini App:',
          buildStartAppButton(env, '🎁 Abrir mi sala', `join_${claimed.roomCode}`)
        );
      } else {
        await sendTelegramMessage(
          env.BOT_TOKEN,
          tgUser.id,
          `⚠️ ${escapeHtml(claimed.error)}`,
          [[{ text: '🎄 Abrir Amigo Invisible', web_app: { url: env.WEBAPP_URL } }]]
        );
      }
      return new Response('ok');
    }

    if (payload.startsWith('verify_')) {
      const roomCode = payload.slice(7);
      await sendPendingAssignmentIfAny(env, tgUser.id);
      await sendTelegramMessage(
        env.BOT_TOKEN,
        tgUser.id,
        '✅ <b>¡Bot activado!</b> Recibirás aquí quién es tu Amigo Invisible y los cambios en su lista de regalos.',
        buildStartAppButton(env, '🎁 Volver al sorteo', `join_${roomCode}`)
      );
      return new Response('ok');
    }
  }

  if (command === '/misorteos' || command === '/start' || command === '/ayuda') {
    await sendPendingAssignmentIfAny(env, tgUser.id);

    const { results: myRooms } = await env.DB.prepare(
      `SELECT r.* FROM rooms r
       INNER JOIN participants p ON p.room_id = r.id
       WHERE p.telegram_user_id = ?
       ORDER BY r.reveal_date ASC, r.created_at DESC
       LIMIT 6`
    )
      .bind(tgUser.id)
      .all<RoomRow>();

    if (myRooms.length === 0) {
      await sendTelegramMessage(
        env.BOT_TOKEN,
        tgUser.id,
        [
          `🎅 <b>¡Hola, ${escapeHtml(tgUser.firstName)}!</b>`,
          '',
          'Bienvenido a <b>Amigo Invisible</b>. Desde la Mini App puedes:',
          '• Crear un sorteo con importe máximo y fecha de revelación',
          '• Invitar directamente a tus contactos de Telegram',
          '• Añadir tu lista de deseos y exclusiones (ej. parejas)',
          '• Recibir en este chat quién te ha tocado y avisos si cambia su lista'
        ].join('\n'),
        [[{ text: '🎁 Abrir Amigo Invisible', web_app: { url: env.WEBAPP_URL } }]]
      );
      return new Response('ok');
    }

    const lines = [
      `🎅 <b>Tus sorteos de Amigo Invisible</b>`,
      '',
      ...myRooms.map((r) => {
        const label =
          r.status === 'revealed'
            ? '🎉 Revelado'
            : r.status === 'drawn'
            ? '🎲 Sorteado'
            : '⏳ Abierto';
        return `• <b>${escapeHtml(r.title)}</b> (${label} · ${escapeHtml(
          formatRevealDate(r.reveal_date)
        )})`;
      }),
      '',
      'Toca un botón para entrar directamente:'
    ];

    const buttons = myRooms.slice(0, 3).map((r) => [
      {
        text: `🎁 ${r.title.slice(0, 28)}`,
        web_app: { url: `${env.WEBAPP_URL.replace(/\/$/, '')}/?tgWebAppStartParam=${encodeURIComponent(`join_${r.code}`)}` }
      }
    ]);
    buttons.push([{ text: '➕ Crear o ver todos', web_app: { url: env.WEBAPP_URL } }]);

    await sendTelegramMessage(env.BOT_TOKEN, tgUser.id, lines.join('\n'), buttons);
    return new Response('ok');
  }

  await sendTelegramMessage(
    env.BOT_TOKEN,
    tgUser.id,
    '🎄 Abre la Mini App para gestionar tus sorteos y listas de deseos:',
    [[{ text: '🎁 Abrir Amigo Invisible', web_app: { url: env.WEBAPP_URL } }]]
  );
  return new Response('ok');
}

async function sendPendingAssignmentIfAny(env: Env, telegramUserId: number): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT p.*, r.id as r_id, r.code as r_code, r.title as r_title, r.max_budget as r_max_budget,
            r.currency as r_currency, r.reveal_date as r_reveal_date, r.notes as r_notes,
            r.organizer_tg_id as r_organizer_tg_id, r.status as r_status, r.drawn_at as r_drawn_at,
            r.revealed_at as r_revealed_at, r.last_reminder_days as r_last_reminder_days,
            r.linked_group_id as r_linked_group_id, r.linked_group_title as r_linked_group_title,
            r.created_at as r_created_at, r.updated_at as r_updated_at
     FROM participants p
     INNER JOIN rooms r ON r.id = p.room_id
     WHERE p.telegram_user_id = ? AND r.status = 'drawn' AND p.assigned_to_id IS NOT NULL AND p.notified_at IS NULL`
  )
    .bind(telegramUserId)
    .all<
      ParticipantRow & {
        r_id: string;
        r_code: string;
        r_title: string;
        r_max_budget: number | null;
        r_currency: string;
        r_reveal_date: string;
        r_notes: string;
        r_organizer_tg_id: number;
        r_status: 'open' | 'drawn' | 'revealed';
        r_drawn_at: string | null;
        r_revealed_at: string | null;
        r_last_reminder_days: number | null;
        r_linked_group_id: number | null;
        r_linked_group_title: string;
        r_created_at: string;
        r_updated_at: string;
      }
    >();

  for (const row of results) {
    const room: RoomRow = {
      id: row.r_id,
      code: row.r_code,
      title: row.r_title,
      max_budget: row.r_max_budget,
      currency: row.r_currency,
      reveal_date: row.r_reveal_date,
      notes: row.r_notes,
      organizer_tg_id: row.r_organizer_tg_id,
      status: row.r_status,
      drawn_at: row.r_drawn_at,
      revealed_at: row.r_revealed_at,
      last_reminder_days: row.r_last_reminder_days,
      linked_group_id: row.r_linked_group_id,
      linked_group_title: row.r_linked_group_title ?? '',
      created_at: row.r_created_at,
      updated_at: row.r_updated_at
    };
    await sendAssignmentDm(env, room, row);
  }
}
