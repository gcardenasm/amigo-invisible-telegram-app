import type { RoomSummaryDto } from '../../shared/types';
import { api, type MeResponse } from '../api';
import { DEV_PROFILES, getActiveDevProfile, setActiveDevProfile } from '../telegram-sdk';
import { attachAccessibleValidation, validateAndFocusFirstInvalid } from '../validation';
import {
  activateBotMessages,
  escapeHtml,
  formatBudget,
  formatRevealDate,
  openRoomFormDialog,
  showToast
} from './components';

export async function renderHomeView(
  container: HTMLElement,
  me: MeResponse,
  navigateToRoom: (code: string) => void,
  reloadAll: () => void
): Promise<void> {
  const { rooms } = await api.listRooms();

  const devBarHtml = me.devMode
    ? `
    <div class="dev-bar">
      <span><strong>Modo pruebas local</strong> · Usuario simulado:</span>
      <select id="dev-profile-select" aria-label="Cambiar usuario de prueba" style="width:auto;min-height:36px;padding:0.25rem 0.5rem;">
        ${DEV_PROFILES.map(
          (p) =>
            `<option value="${p.id}" ${
              getActiveDevProfile().id === p.id ? 'selected' : ''
            }>${escapeHtml(p.name)}</option>`
        ).join('')}
      </select>
    </div>`
    : '';

  const botWarningHtml = !me.botReachable
    ? `
    <div class="alert alert-warn">
      <div><strong>🔔 Activa los avisos del bot</strong></div>
      <div>Para que el bot pueda decirte en privado quién es tu amigo invisible y avisarte si cambia su lista, pulsa abajo para darle permiso.</div>
      <button type="button" id="home-activate-bot" class="btn-primary btn-sm">Activar mensajes del bot</button>
    </div>`
    : '';

  const roomsListHtml =
    rooms.length === 0
      ? `
      <div class="card">
        <p class="muted" style="margin:0;">
          Todavía no participas en ningún sorteo. Crea uno nuevo o introduce el código que te hayan compartido.
        </p>
      </div>`
      : `
      <div class="list" role="list">
        ${rooms
          .map(
            (r: RoomSummaryDto) => `
          <button type="button" class="room-card-btn" data-open-room="${escapeHtml(r.code)}">
            <div class="room-card-info">
              <div class="list-item-title">${escapeHtml(r.title)}</div>
              <div class="muted">
                💰 ${escapeHtml(formatBudget(r.maxBudget, r.currency))} · 📅 ${escapeHtml(
              formatRevealDate(r.revealDate)
            )} · 👥 ${r.participantCount}
              </div>
            </div>
            <span class="badge ${r.status === 'drawn' ? 'badge-success' : 'badge-warn'}">
              ${r.status === 'drawn' ? '🎲 Sorteado' : '⏳ Abierto'}
            </span>
          </button>`
          )
          .join('')}
      </div>`;

  container.innerHTML = `
    ${devBarHtml}
    <header class="header-bar">
      <div>
        <h1 class="header-title">🎅 Amigo Invisible</h1>
        <p class="header-subtitle">Hola, ${escapeHtml(me.user.displayName)}</p>
      </div>
      <span class="badge ${me.botReachable ? 'badge-success' : 'badge-neutral'}">
        ${me.botReachable ? '✅ Bot activo' : '⏳ Bot pendiente'}
      </span>
    </header>

    ${botWarningHtml}

    <div class="card card-hero">
      <h2 class="section-title">Organiza un sorteo gratis</h2>
      <p class="muted" style="margin:0;">
        Añade tus contactos de Telegram, fija el importe máximo y la fecha de revelación. Cada uno crea su lista de deseos y el bot reparte en privado.
      </p>
      <button type="button" id="btn-create-room" class="btn-primary">
        ➕ Crear nuevo sorteo
      </button>
    </div>

    <section class="card" aria-labelledby="rooms-heading">
      <div class="section-header">
        <h2 id="rooms-heading" class="section-title">Tus sorteos</h2>
        <span class="badge badge-neutral">${rooms.length}</span>
      </div>
      ${roomsListHtml}
    </section>

    <section class="card" aria-labelledby="join-heading">
      <h2 id="join-heading" class="section-title">Unirse con código</h2>
      <form id="join-code-form" class="form-stack" novalidate>
        <div class="field">
          <label for="join-code-input">Código de invitación</label>
          <input
            id="join-code-input"
            name="code"
            type="text"
            required
            minlength="4"
            maxlength="20"
            autocorrect="off"
            autocapitalize="characters"
            spellcheck="false"
            enterkeyhint="go"
            data-error="join-code-error"
            placeholder="Ej. A7K9M2P4"
          />
          <div id="join-code-error" class="error-msg">
            <span role="img" aria-label="Error">❌</span> Introduce el código del sorteo (mínimo 4 caracteres).
          </div>
        </div>
        <button type="submit" class="btn-secondary">Entrar al sorteo</button>
      </form>
    </section>
  `;

  attachAccessibleValidation(container);

  container.querySelector('#dev-profile-select')?.addEventListener('change', (e) => {
    const val = Number((e.target as HTMLSelectElement).value);
    setActiveDevProfile(val);
    reloadAll();
  });

  container.querySelector('#home-activate-bot')?.addEventListener('click', async () => {
    const ok = await activateBotMessages(me.botUsername);
    if (ok) reloadAll();
  });

  container.querySelector('#btn-create-room')?.addEventListener('click', () => {
    openRoomFormDialog({
      mode: 'create',
      onSubmit: async (values) => {
        const res = await api.createRoom(values);
        showToast('🎉 Sorteo creado');
        navigateToRoom(res.code);
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-open-room]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.openRoom;
      if (code) navigateToRoom(code);
    });
  });

  const joinForm = container.querySelector<HTMLFormElement>('#join-code-form')!;
  const joinBtn = joinForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateAndFocusFirstInvalid(joinForm)) return;

    const code = String(new FormData(joinForm).get('code') ?? '').trim().toUpperCase();
    joinBtn.disabled = true;
    try {
      const res = await api.joinRoom({ roomCode: code });
      showToast('🎉 Te has unido al sorteo');
      navigateToRoom(res.code);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo entrar al sorteo');
      joinBtn.disabled = false;
    }
  });
}
