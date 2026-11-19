import { computeDaysUntilReveal, getAutoReminderMilestone } from '../shared/countdown';
import { buildStartAppButton, updateBotReachability, type ParticipantRow, type RoomRow } from './db';
import type { Env } from './env';
import { escapeHtml, formatBudget, formatRevealDate, sendTelegramMessage } from './telegram';

function buildReminderHtml(room: RoomRow, milestone: 7 | 2 | 0): string {
  const title = escapeHtml(room.title);
  const budget = escapeHtml(formatBudget(room.max_budget, room.currency));
  const dateLabel = escapeHtml(formatRevealDate(room.reveal_date));

  if (milestone === 0) {
    const lines = [
      `🎉 <b>¡Hoy es la revelación de «${title}»!</b>`,
      '',
      `📅 Fecha: <b>${dateLabel}</b>`,
      `💰 Importe máximo: <b>${budget}</b>`
    ];
    if (room.notes.trim()) {
      lines.push(`📝 Notas: ${escapeHtml(room.notes.trim())}`);
    }
    lines.push(
      '',
      room.status === 'open'
        ? '⚠️ El sorteo aún está abierto: recuerda al organizador realizarlo cuanto antes.'
        : '¡Disfrutad mucho del intercambio de regalos!'
    );
    return lines.join('\n');
  }

  const daysText = milestone === 7 ? '7 días' : '2 días';
  const lines = [
    `⏳ <b>Faltan ${daysText} para «${title}»</b>`,
    '',
    `📅 Día de revelación: <b>${dateLabel}</b>`,
    `💰 Importe máximo: <b>${budget}</b>`,
    '',
    room.status === 'open'
      ? 'Recuerda añadir tu lista de regalos antes de que comience el sorteo.'
      : 'Revisa tu amigo invisible en la Mini App por si ha actualizado su lista o dejado pistas.'
  ];
  return lines.join('\n');
}

export async function handleScheduledReminders(
  env: Env,
  now: Date = new Date()
): Promise<void> {
  if (!env.BOT_TOKEN || env.BOT_TOKEN.includes('REEMPLAZA')) {
    return;
  }

  const { results: rooms } = await env.DB.prepare(
    "SELECT * FROM rooms WHERE status IN ('open', 'drawn')"
  ).all<RoomRow>();

  for (const room of rooms) {
    const daysLeft = computeDaysUntilReveal(room.reveal_date, now);
    const milestone = getAutoReminderMilestone(daysLeft, room.last_reminder_days ?? null);
    if (milestone === null) continue;

    await env.DB.prepare('UPDATE rooms SET last_reminder_days = ? WHERE id = ?')
      .bind(milestone, room.id)
      .run();

    const { results: participants } = await env.DB.prepare(
      'SELECT * FROM participants WHERE room_id = ? AND telegram_user_id IS NOT NULL'
    )
      .bind(room.id)
      .all<ParticipantRow>();

    const html = buildReminderHtml(room, milestone);
    const keyboard = buildStartAppButton(env, '🎁 Abrir sorteo', `join_${room.code}`);

    for (const p of participants) {
      if (!p.telegram_user_id) continue;
      const res = await sendTelegramMessage(env.BOT_TOKEN, p.telegram_user_id, html, keyboard);
      if (res.ok) {
        await updateBotReachability(env.DB, p.telegram_user_id, true);
      } else if (res.blocked) {
        await updateBotReachability(env.DB, p.telegram_user_id, false);
      }
    }
  }
}
