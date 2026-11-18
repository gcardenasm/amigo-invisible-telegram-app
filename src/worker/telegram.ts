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

export function buildAssignmentMessageHtml(params: {
  roomTitle: string;
  targetName: string;
  targetUsername: string | null;
  maxBudget: number | null;
  currency: string;
  revealDate: string;
  notes: string;
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
