import type { WishlistItemDto } from '../shared/types';

export interface TelegramSendResult {
  ok: boolean;
  blocked?: boolean;
  description?: string;
}

export interface InlineButton {
  text: string;
  url?: string;
  web_app?: { url: string };
  callback_data?: string;
}

export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function formatBudget(amount: number | null, currency: string): string {
  if (amount === null || !Number.isFinite(amount)) {
    return 'Sin límite definido';
  }
  const symbols: Record<string, string> = {
    EUR: '€',
    USD: '$',
    MXN: 'MXN $',
    ARS: 'ARS $',
    COP: 'COP $',
    CLP: 'CLP $',
    GBP: '£'
  };
  const symbol = symbols[currency] ?? currency;
  const formatted = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return currency === 'EUR' ? `${formatted} ${symbol}` : `${symbol}${formatted}`;
}

export function formatRevealDate(isoDate: string): string {
  if (!isoDate) return 'Por definir';
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre'
  ];
  return `${day} de ${months[month - 1] ?? month} de ${year}`;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  htmlText: string,
  inlineKeyboard?: InlineButton[][]
): Promise<TelegramSendResult> {
  if (!botToken || botToken.includes('REEMPLAZA')) {
    return { ok: false, description: 'BOT_TOKEN no configurado' };
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (inlineKeyboard && inlineKeyboard.length > 0) {
      body.reply_markup = { inline_keyboard: inlineKeyboard };
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = (await res.json()) as {
      ok: boolean;
      error_code?: number;
      description?: string;
    };

    if (data.ok) {
      return { ok: true };
    }

    const desc = data.description ?? 'Error desconocido de Telegram';
    const isBlocked =
      data.error_code === 403 ||
      desc.includes("can't initiate conversation") ||
      desc.includes('bot was blocked') ||
      desc.includes('chat not found');

    return { ok: false, blocked: isBlocked, description: desc };
  } catch (err) {
    return {
      ok: false,
      description: err instanceof Error ? err.message : 'Error de red enviando mensaje'
    };
  }
}

export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string
): Promise<void> {
  if (!botToken) return;
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text
    })
  }).catch(() => undefined);
}

export function normalizeBotUsername(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^t\.me\//i, '')
    .split(/[/?#]/)[0] ?? '';
  return cleaned.replace(/^@+/, '').trim();
}

export function buildInviteStartAppUrl(botUsername: string, startParam: string): string {
  const username = normalizeBotUsername(botUsername);
  return `https://t.me/${username}?startapp=${encodeURIComponent(startParam)}`;
}

export function buildInviteMessageHtml(params: {
  roomTitle: string;
  maxBudget: number | null;
  currency: string;
  revealDate: string;
  notes: string;
  recipientName?: string;
}): string {
  const greeting = params.recipientName
    ? `🎄 <b>¡Hola ${escapeHtml(params.recipientName)}! Te han invitado al Amigo Invisible «${escapeHtml(params.roomTitle)}»</b>`
    : `🎄 <b>¡Únete al Amigo Invisible «${escapeHtml(params.roomTitle)}»!</b>`;

  const lines = [
    greeting,
    '',
    `💰 <b>Importe máximo:</b> ${escapeHtml(formatBudget(params.maxBudget, params.currency))}`,
    `📅 <b>Día de revelación:</b> ${escapeHtml(formatRevealDate(params.revealDate))}`
  ];

  if (params.notes.trim()) {
    lines.push(`📝 <b>Notas:</b> ${escapeHtml(params.notes.trim())}`);
  }

  lines.push('', 'Pulsa el botón de abajo para entrar directo en la Mini App y añadir tu lista de regalos:');
  return lines.join('\n');
}

export interface PreparedInlineResult {
  ok: true;
  id: string;
}

export interface PreparedInlineError {
  ok: false;
  inlineDisabled?: boolean;
  description: string;
}

export async function savePreparedInlineMessage(
  botToken: string,
  params: {
    userId: number;
    resultId: string;
    title: string;
    description?: string;
    htmlText: string;
    buttonText: string;
    buttonUrl: string;
  }
): Promise<PreparedInlineResult | PreparedInlineError> {
  if (!botToken || botToken.includes('REEMPLAZA')) {
    return { ok: false, description: 'BOT_TOKEN no configurado' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/savePreparedInlineMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: params.userId,
        allow_user_chats: true,
        allow_group_chats: true,
        allow_channel_chats: false,
        allow_bot_chats: false,
        result: {
          type: 'article',
          id: params.resultId,
          title: params.title,
          description: params.description ?? params.title,
          input_message_content: {
            message_text: params.htmlText,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          },
          reply_markup: {
            inline_keyboard: [[{ text: params.buttonText, url: params.buttonUrl }]]
          }
        }
      })
    });

    const data = (await res.json()) as {
      ok: boolean;
      result?: { id: string };
      description?: string;
    };

    if (data.ok && data.result?.id) {
      return { ok: true, id: data.result.id };
    }

    const desc = data.description ?? 'No se pudo preparar la invitación interactiva';
    const inlineDisabled =
      desc.includes('BOT_INLINE_DISABLED') || desc.toLowerCase().includes('inline');

    return { ok: false, inlineDisabled, description: desc };
  } catch (err) {
    return {
      ok: false,
      description: err instanceof Error ? err.message : 'Error de red preparando invitación'
    };
  }
}

export interface InlineQueryArticle {
  type: 'article';
  id: string;
  title: string;
  description?: string;
  input_message_content: {
    message_text: string;
    parse_mode: 'HTML';
    disable_web_page_preview?: boolean;
  };
  reply_markup?: {
    inline_keyboard: InlineButton[][];
  };
}

export async function answerInlineQuery(
  botToken: string,
  inlineQueryId: string,
  results: InlineQueryArticle[]
): Promise<void> {
  if (!botToken) return;
  await fetch(`https://api.telegram.org/bot${botToken}/answerInlineQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inline_query_id: inlineQueryId,
      results,
      cache_time: 10,
      is_personal: true
    })
  }).catch(() => undefined);
}

export function buildAssignmentMessageHtml(params: {
  roomTitle: string;
  targetName: string;
  targetUsername: string | null;
  maxBudget: number | null;
  currency: string;
  revealDate: string;
  notes: string;
  sizes?: string;
  allergies?: string;
  dislikes?: string;
  wishlist: WishlistItemDto[];
  isRedraw?: boolean;
}): string {
  const header = params.isRedraw
    ? `🔄 <b>¡Nuevo sorteo en "${escapeHtml(params.roomTitle)}"!</b>`
    : `🎁 <b>¡Ya tienes Amigo Invisible en "${escapeHtml(params.roomTitle)}"!</b>`;

  const usernamePart = params.targetUsername
    ? ` (@${escapeHtml(params.targetUsername)})`
    : '';

  const lines: string[] = [
    header,
    '',
    `🤫 Te ha tocado regalar a: <b>${escapeHtml(params.targetName)}</b>${usernamePart}`,
    `💰 <b>Importe máximo:</b> ${escapeHtml(formatBudget(params.maxBudget, params.currency))}`,
    `📅 <b>Día de revelación:</b> ${escapeHtml(formatRevealDate(params.revealDate))}`
  ];

  if (params.notes.trim()) {
    lines.push(`📝 <b>Notas del evento:</b> ${escapeHtml(params.notes.trim())}`);
  }

  const prefLines: string[] = [];
  if (params.sizes?.trim()) {
    prefLines.push(`📏 <b>Tallas:</b> ${escapeHtml(params.sizes.trim())}`);
  }
  if (params.allergies?.trim()) {
    prefLines.push(`⚠️ <b>Alergias:</b> ${escapeHtml(params.allergies.trim())}`);
  }
  if (params.dislikes?.trim()) {
    prefLines.push(`🚫 <b>Evitar / No regalar:</b> ${escapeHtml(params.dislikes.trim())}`);
  }
  if (prefLines.length > 0) {
    lines.push('', ...prefLines);
  }

  lines.push('');
  if (params.wishlist.length > 0) {
    lines.push(`✨ <b>Lista de preferencias de ${escapeHtml(params.targetName)}:</b>`);
    for (const item of params.wishlist) {
      let line = `• <b>${escapeHtml(item.title)}</b>`;
      if (item.notes) {
        line += ` — <i>${escapeHtml(item.notes)}</i>`;
      }
      if (item.url) {
        line += ` (<a href="${escapeHtml(item.url)}">ver enlace</a>)`;
      }
      lines.push(line);
    }
  } else {
    lines.push(
      `⏳ <i>${escapeHtml(params.targetName)} aún no ha añadido regalos a su lista. El bot te avisará cuando añada ideas.</i>`
    );
  }

  return lines.join('\n');
}

export function buildRevealSummaryHtml(params: {
  roomTitle: string;
  pairs: Array<{ giverName: string; receiverName: string }>;
}): string {
  const lines = [
    `🎉 <b>¡Revelación final de «${escapeHtml(params.roomTitle)}»!</b>`,
    '',
    'Así quedaron los emparejamientos del Amigo Invisible:',
    ''
  ];
  for (const pair of params.pairs) {
    lines.push(
      `• <b>${escapeHtml(pair.giverName)}</b> 🎁→ <b>${escapeHtml(pair.receiverName)}</b>`
    );
  }
  return lines.join('\n');
}
