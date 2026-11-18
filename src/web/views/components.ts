import { api } from '../api';
import { setupModalDialog } from '../dialog';
import { openTelegramBotLink, requestBotWriteAccess } from '../telegram-sdk';
import { attachAccessibleValidation, validateAndFocusFirstInvalid } from '../validation';

export function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatBudget(amount: number | null, currency: string): string {
  if (amount === null || !Number.isFinite(amount)) return 'Sin límite';
  const symbols: Record<string, string> = {
    EUR: '€',
    USD: '$',
    MXN: 'MXN $',
    ARS: 'ARS $',
    COP: 'COP $',
    CLP: 'CLP $',
    GBP: '£'
  };
  const sym = symbols[currency] ?? currency;
  const val = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return currency === 'EUR' ? `${val} ${sym}` : `${sym}${val}`;
}

export function formatRevealDate(isoDate: string): string {
  if (!isoDate) return 'Por definir';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const months = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic'
  ];
  return `${d} ${months[m - 1] ?? m} ${y}`;
}

export function showToast(message: string): void {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  region.append(el);
  window.setTimeout(() => {
    el.remove();
  }, 3200);
}

export async function activateBotMessages(
  botUsername: string,
  roomCode?: string
): Promise<boolean> {
  const allowed = await requestBotWriteAccess();
  if (allowed) {
    try {
      const res = await api.pingBot(roomCode);
      if (res.reachable) {
        showToast('✅ Avisos del bot activados');
        return true;
      }
    } catch {
      // Fallback al enlace /start del bot
    }
  }

  const payload = roomCode ? `verify_${roomCode}` : 'start';
  openTelegramBotLink(`https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`);
  showToast('Pulsa "Iniciar" en el chat del bot y vuelve aquí');
  return false;
}

export function openRoomFormDialog(params: {
  mode: 'create' | 'edit';
  initial?: {
    title: string;
    maxBudget: number | null;
    currency: string;
    revealDate: string;
    notes: string;
  };
  onSubmit: (values: {
    title: string;
    maxBudget: number | null;
    currency: string;
    revealDate: string;
    notes: string;
  }) => Promise<void>;
}): void {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('closedby', 'any');
  const titleId = `room-modal-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', titleId);

  const defaultDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const init = params.initial ?? {
    title: '',
    maxBudget: 20,
    currency: 'EUR',
    revealDate: defaultDate,
    notes: ''
  };

  dialog.innerHTML = `
    <div class="dialog-header">
      <h2 id="${titleId}" class="dialog-title">
        ${params.mode === 'create' ? '🎄 Nuevo Amigo Invisible' : '✏️ Editar sorteo'}
      </h2>
      <button type="button" class="btn-secondary btn-sm" data-close aria-label="Cerrar diálogo">✕</button>
    </div>
    <form class="form-stack" novalidate>
      <div class="field">
        <label for="room-title-input">Nombre del grupo o evento *</label>
        <input
          id="room-title-input"
          name="title"
          type="text"
          required
          minlength="2"
          maxlength="80"
          autofocus
          enterkeyhint="next"
          data-error="room-title-error"
          value="${escapeHtml(init.title)}"
          placeholder="Ej. Navidad Familia 2026"
        />
        <div id="room-title-error" class="error-msg">
          <span role="img" aria-label="Error">❌</span> Escribe un nombre de entre 2 y 80 caracteres.
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="room-budget-input">Importe máximo</label>
          <input
            id="room-budget-input"
            name="maxBudget"
            type="number"
            min="1"
            max="1000000"
            step="0.5"
            inputmode="decimal"
            enterkeyhint="next"
            data-error="room-budget-error"
            value="${init.maxBudget !== null ? String(init.maxBudget) : ''}"
            placeholder="Ej. 20"
          />
          <div id="room-budget-error" class="error-msg">
            <span role="img" aria-label="Error">❌</span> Introduce un importe mayor que 0.
          </div>
        </div>

        <div class="field">
          <label for="room-currency-input">Moneda</label>
          <select id="room-currency-input" name="currency">
            <option value="EUR" ${init.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
            <option value="USD" ${init.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
            <option value="MXN" ${init.currency === 'MXN' ? 'selected' : ''}>MXN ($)</option>
            <option value="ARS" ${init.currency === 'ARS' ? 'selected' : ''}>ARS ($)</option>
            <option value="COP" ${init.currency === 'COP' ? 'selected' : ''}>COP ($)</option>
            <option value="CLP" ${init.currency === 'CLP' ? 'selected' : ''}>CLP ($)</option>
            <option value="GBP" ${init.currency === 'GBP' ? 'selected' : ''}>GBP (£)</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label for="room-date-input">Día de revelación de regalos *</label>
        <input
          id="room-date-input"
          name="revealDate"
          type="date"
          required
          data-error="room-date-error"
          value="${escapeHtml(init.revealDate)}"
        />
        <div id="room-date-error" class="error-msg">
          <span role="img" aria-label="Error">❌</span> Elige el día en que entregaréis los regalos.
        </div>
      </div>

      <div class="field">
        <label for="room-notes-input">Notas o lugar del encuentro (opcional)</label>
        <textarea
          id="room-notes-input"
          name="notes"
          maxlength="500"
          placeholder="Ej. Cena a las 21:00 en casa de Marta"
        >${escapeHtml(init.notes)}</textarea>
      </div>

      <div class="dialog-actions">
        <button type="button" class="btn-secondary" data-close>Cancelar</button>
        <button type="submit" class="btn-primary">
          ${params.mode === 'create' ? 'Crear sorteo' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  `;

  document.body.append(dialog);
  setupModalDialog(dialog);
  attachAccessibleValidation(dialog);

  const form = dialog.querySelector('form')!;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  dialog.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => dialog.close());
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateAndFocusFirstInvalid(form)) return;

    const fd = new FormData(form);
    const title = String(fd.get('title') ?? '').trim();
    const rawBudget = String(fd.get('maxBudget') ?? '').trim();
    const maxBudget = rawBudget === '' ? null : Number(rawBudget);
    const currency = String(fd.get('currency') ?? 'EUR');
    const revealDate = String(fd.get('revealDate') ?? '');
    const notes = String(fd.get('notes') ?? '').trim();

    submitBtn.disabled = true;
    try {
      await params.onSubmit({ title, maxBudget, currency, revealDate, notes });
      dialog.close();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar');
      submitBtn.disabled = false;
    }
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}
