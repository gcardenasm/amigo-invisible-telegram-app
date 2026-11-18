import type { ExclusionDto, ParticipantDto, RoomDetailDto, WishlistItemDto } from '../../shared/types';
import { api } from '../api';
import { openConfirmDialog, setupModalDialog } from '../dialog';
import { openExternalUrl, shareViaTelegram } from '../telegram-sdk';
import { attachAccessibleValidation, validateAndFocusFirstInvalid } from '../validation';
import {
  activateBotMessages,
  escapeHtml,
  formatBudget,
  formatRevealDate,
  openRoomFormDialog,
  showToast
} from './components';

export async function renderRoomView(
  container: HTMLElement,
  code: string,
  onBackHome: () => void
): Promise<void> {
  const detail = await api.getRoom(code);
  const { room, me, participants, exclusions, myTarget, botUsername } = detail;

  const participantMap = new Map(participants.map((p) => [p.id, p]));
  const inviteLink = `https://t.me/${botUsername}?startapp=join_${room.code}`;
  const shareText = `🎄 ¡Únete a nuestro Amigo Invisible "${room.title}"! Importe máx: ${formatBudget(
    room.maxBudget,
    room.currency
  )} · Día: ${formatRevealDate(room.revealDate)}. Entra y pon tu lista de regalos:`;

  let targetRevealOpen = false;

  const botBannerHtml = !me.botReachable
    ? `
    <div class="alert alert-warn">
      <div><strong>🔔 Activa los mensajes privados del bot</strong></div>
      <div>Para recibir en privado quién te ha tocado y enterarte si cambia su lista de regalos, activa el bot con un toque.</div>
      <button type="button" id="room-activate-bot" class="btn-primary btn-sm">Activar avisos del bot</button>
    </div>`
    : '';

  const secretSantaCardHtml =
    room.status === 'drawn' && myTarget
      ? `
      <section class="card card-hero" aria-labelledby="target-heading">
        <div class="section-header">
          <h2 id="target-heading" class="section-title">🤫 Tu Amigo Invisible</h2>
          <span class="badge badge-success">Sorteado</span>
        </div>
        <div class="reveal-box">
          <div id="reveal-hidden-msg">
            <p class="muted" style="margin:0 0 0.75rem;">Pulsa para revelar a quién regalas sin miradas indiscretas.</p>
            <button type="button" id="btn-toggle-reveal" class="btn-primary">👀 Ver a quién regalo</button>
          </div>
          <div id="reveal-shown-msg" hidden>
            <div class="muted">Tienes que regalar a:</div>
            <div class="reveal-name">${escapeHtml(myTarget.displayName)}</div>
            ${
              myTarget.telegramUsername
                ? `<div class="muted">@${escapeHtml(myTarget.telegramUsername)}</div>`
                : ''
            }
            <div style="margin-top:0.75rem;">
              <button type="button" id="btn-hide-reveal" class="btn-secondary btn-sm">🙈 Ocultar nombre</button>
            </div>
          </div>
        </div>

        <div id="target-wishlist-panel" hidden>
          <h3 class="section-title" style="font-size:0.95rem;margin-bottom:0.45rem;">
            ✨ Lista de preferencias de ${escapeHtml(myTarget.displayName)}
          </h3>
          ${
            myTarget.wishlist.length === 0
              ? `<p class="muted" style="margin:0;">Todavía no ha añadido ideas a su lista. El bot te avisará en cuanto añada alguna.</p>`
              : `<ul class="list">
                  ${myTarget.wishlist
                    .map(
                      (item) => `
                    <li class="list-item">
                      <div class="list-item-main">
                        <div class="list-item-title">${escapeHtml(item.title)}</div>
                        ${item.notes ? `<div class="muted">${escapeHtml(item.notes)}</div>` : ''}
                        ${
                          item.url
                            ? `<button type="button" class="btn-secondary btn-sm" style="align-self:flex-start;margin-top:0.25rem;" data-open-url="${escapeHtml(
                                item.url
                              )}">🔗 Ver enlace</button>`
                            : ''
                        }
                      </div>
                    </li>`
                    )
                    .join('')}
                </ul>`
          }
        </div>
      </section>`
      : '';

  const myWishlistHtml = `
    <section class="card" aria-labelledby="my-wishlist-heading">
      <div class="section-header">
        <h2 id="my-wishlist-heading" class="section-title">🎁 Mi lista de regalos</h2>
        <span class="badge badge-neutral">${me.wishlist.length}</span>
      </div>
      <p class="muted" style="margin:0;">
        Añade tus preferencias en forma de lista para ayudar a quien le hayas tocado.${
          room.status === 'drawn'
            ? ' Si la modificas ahora, el bot avisará por privado a tu Amigo Invisible.'
            : ''
        }
      </p>

      ${
        me.wishlist.length === 0
          ? `<div class="alert alert-info">Tu lista está vacía. ¡Añade tu primera idea de regalo!</div>`
          : `<ul class="list">
              ${me.wishlist
                .map(
                  (item: WishlistItemDto) => `
                <li class="list-item">
                  <div class="list-item-main">
                    <div class="list-item-title">${escapeHtml(item.title)}</div>
                    ${item.notes ? `<div class="muted">${escapeHtml(item.notes)}</div>` : ''}
                    ${
                      item.url
                        ? `<a href="${escapeHtml(
                            item.url
                          )}" target="_blank" rel="noopener noreferrer" class="link-inline" data-ext-url="${escapeHtml(
                            item.url
                          )}">${escapeHtml(item.url)}</a>`
                        : ''
                    }
                  </div>
                  <div class="list-item-actions">
                    <button type="button" class="btn-secondary btn-sm" data-edit-wish="${escapeHtml(
                      item.id
                    )}" aria-label="Editar ${escapeHtml(item.title)}">✏️</button>
                    <button type="button" class="btn-danger btn-sm" data-del-wish="${escapeHtml(
                      item.id
                    )}" aria-label="Eliminar ${escapeHtml(item.title)}">🗑️</button>
                  </div>
                </li>`
                )
                .join('')}
            </ul>`
      }

      <button type="button" id="btn-add-wish" class="btn-primary">➕ Añadir idea a mi lista</button>
    </section>
  `;

  const participantsHtml = `
    <section class="card" aria-labelledby="participants-heading">
      <div class="section-header">
        <h2 id="participants-heading" class="section-title">👥 Participantes y contactos</h2>
        <span class="badge badge-neutral">${participants.length}</span>
      </div>

      <div class="btn-row">
        <button type="button" id="btn-share-telegram" class="btn-primary">
          📨 Invitar contactos de Telegram
        </button>
        <button type="button" id="btn-copy-link" class="btn-secondary">
          📋 Copiar enlace
        </button>
      </div>
      <div class="muted">
        Código de sala: <strong>${escapeHtml(room.code)}</strong> · Cuando tus contactos abran la invitación quedarán conectados al bot automáticamente.
      </div>

      <ul class="list">
        ${participants
          .map((p: ParticipantDto) => {
            const botBadge = !p.hasJoinedTelegram
              ? `<span class="badge badge-neutral">📩 Pendiente de entrar</span>`
              : p.botReachable
              ? `<span class="badge badge-success">✅ Bot activo</span>`
              : `<span class="badge badge-warn">⚠️ Falta activar bot</span>`;

            const personalLink =
              p.claimToken && room.isOrganizer
                ? `https://t.me/${botUsername}?startapp=claim_${p.claimToken}`
                : '';

            return `
              <li class="list-item">
                <div class="list-item-main">
                  <div class="list-item-title">
                    ${escapeHtml(p.displayName)}
                    ${p.isOrganizer ? '<span class="badge badge-neutral">Organizador</span>' : ''}
                    ${p.isMe ? '<span class="badge badge-neutral">Tú</span>' : ''}
                  </div>
                  <div class="muted">
                    ${p.telegramUsername ? `@${escapeHtml(p.telegramUsername)} · ` : ''}🎁 ${
              p.wishlistCount
            } ${p.wishlistCount === 1 ? 'idea' : 'ideas'}
                  </div>
                  <div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.25rem;">
                    ${botBadge}
                  </div>
                </div>
                <div class="list-item-actions">
                  ${
                    personalLink
                      ? `<button type="button" class="btn-secondary btn-sm" data-share-claim="${escapeHtml(
                          personalLink
                        )}" data-claim-name="${escapeHtml(
                          p.displayName
                        )}" title="Enviar enlace personal por Telegram">📤 Enviar</button>`
                      : ''
                  }
                  ${
                    room.isOrganizer && room.status === 'open' && !p.isOrganizer
                      ? `<button type="button" class="btn-danger btn-sm" data-del-participant="${escapeHtml(
                          p.id
                        )}" data-del-name="${escapeHtml(
                          p.displayName
                        )}" aria-label="Quitar a ${escapeHtml(p.displayName)}">✕</button>`
                      : ''
                  }
                </div>
              </li>`;
          })
          .join('')}
      </ul>

      ${
        room.isOrganizer && room.status === 'open'
          ? `
        <form id="add-contact-form" class="form-stack" style="border-top:1px solid var(--border);padding-top:0.85rem;" novalidate>
          <h3 class="section-title" style="font-size:0.95rem;">➕ Añadir contacto manualmente a la lista</h3>
          <div class="field-row">
            <div class="field">
              <label for="contact-name-input">Nombre *</label>
              <input
                id="contact-name-input"
                name="displayName"
                type="text"
                required
                maxlength="60"
                enterkeyhint="next"
                data-error="contact-name-error"
                placeholder="Ej. Laura"
              />
              <div id="contact-name-error" class="error-msg">
                <span role="img" aria-label="Error">❌</span> Escribe un nombre.
              </div>
            </div>
            <div class="field">
              <label for="contact-user-input">@usuario Telegram (opcional)</label>
              <input
                id="contact-user-input"
                name="telegramUsername"
                type="text"
                autocorrect="off"
                autocapitalize="none"
                spellcheck="false"
                enterkeyhint="done"
                placeholder="@laura_g"
              />
            </div>
          </div>
          <button type="submit" class="btn-secondary">Añadir a la sala</button>
        </form>`
          : ''
      }
    </section>
  `;

  const exclusionsHtml =
    room.isOrganizer
      ? `
    <section class="card" aria-labelledby="exclusions-heading">
      <div class="section-header">
        <h2 id="exclusions-heading" class="section-title">🚫 Exclusiones (parejas, etc.)</h2>
        <span class="badge badge-neutral">${exclusions.length}</span>
      </div>
      <p class="muted" style="margin:0;">
        Evita que dos personas se regalen entre sí.
      </p>
      ${
        exclusions.length > 0
          ? `<ul class="list">
              ${exclusions
                .map((ex: ExclusionDto) => {
                  const g = participantMap.get(ex.giverId)?.displayName ?? 'Participante';
                  const r = participantMap.get(ex.excludedReceiverId)?.displayName ?? 'Participante';
                  return `
                    <li class="list-item">
                      <div class="list-item-main">
                        <span><strong>${escapeHtml(g)}</strong> no regala a <strong>${escapeHtml(
                    r
                  )}</strong></span>
                      </div>
                      ${
                        room.status === 'open'
                          ? `<button type="button" class="btn-danger btn-sm" data-del-exclusion="${escapeHtml(
                              ex.id
                            )}" aria-label="Eliminar exclusión">✕</button>`
                          : ''
                      }
                    </li>`;
                })
                .join('')}
            </ul>`
          : ''
      }
      ${
        room.status === 'open' && participants.length >= 2
          ? `
        <form id="add-exclusion-form" class="form-stack" novalidate>
          <div class="field-row">
            <div class="field">
              <label for="ex-giver">Quien regala</label>
              <select id="ex-giver" name="giverId" required>
                ${participants
                  .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.displayName)}</option>`)
                  .join('')}
              </select>
            </div>
            <div class="field">
              <label for="ex-receiver">No puede regalar a</label>
              <select id="ex-receiver" name="excludedReceiverId" required>
                ${participants
                  .map(
                    (p, idx) =>
                      `<option value="${escapeHtml(p.id)}" ${idx === 1 ? 'selected' : ''}>${escapeHtml(
                        p.displayName
                      )}</option>`
                  )
                  .join('')}
              </select>
            </div>
          </div>
          <div class="checkbox-row">
            <input type="checkbox" id="ex-mutual" name="mutual" checked />
            <label for="ex-mutual" style="font-weight:500;">Mutua (ninguno regala al otro, ideal parejas)</label>
          </div>
          <button type="submit" class="btn-secondary">Añadir exclusión</button>
        </form>`
          : ''
      }
    </section>`
      : '';

  const organizerControlsHtml = room.isOrganizer
    ? `
    <section class="card" aria-labelledby="org-actions-heading">
      <h2 id="org-actions-heading" class="section-title">⚙️ Controles del organizador</h2>
      <div class="btn-row">
        <button type="button" id="btn-remind-pending" class="btn-secondary">
          ⏰ Recordar a pendientes
        </button>
        ${
          room.status === 'open'
            ? `<button type="button" id="btn-run-draw" class="btn-primary" ${
                participants.length < 3 ? 'disabled' : ''
              }>🎲 Realizar sorteo ahora</button>`
            : `<button type="button" id="btn-redraw" class="btn-secondary">🔄 Volver a sortear</button>`
        }
      </div>
      ${
        room.status === 'open' && participants.length < 3
          ? `<div class="muted">Necesitas al menos 3 participantes para hacer el sorteo (ahora hay ${participants.length}).</div>`
          : ''
      }
      <div class="btn-row" style="margin-top:0.25rem;">
        <button type="button" id="btn-edit-room" class="btn-secondary btn-sm">✏️ Editar evento</button>
        <button type="button" id="btn-delete-room" class="btn-danger btn-sm">🗑️ Eliminar sorteo</button>
      </div>
    </section>`
    : '';

  container.innerHTML = `
    <header class="header-bar">
      <div style="min-width:0;">
        <button type="button" id="btn-back-home" class="btn-secondary btn-sm" style="margin-bottom:0.45rem;">← Mis sorteos</button>
        <h1 class="header-title">${escapeHtml(room.title)}</h1>
      </div>
      <span class="badge ${room.status === 'drawn' ? 'badge-success' : 'badge-warn'}">
        ${room.status === 'drawn' ? '🎲 Sorteado' : '⏳ Abierto'}
      </span>
    </header>

    <div class="meta-grid">
      <div class="meta-box">
        <div class="meta-label">Importe máximo</div>
        <div class="meta-value">💰 ${escapeHtml(formatBudget(room.maxBudget, room.currency))}</div>
      </div>
      <div class="meta-box">
        <div class="meta-label">Día de revelación</div>
        <div class="meta-value">📅 ${escapeHtml(formatRevealDate(room.revealDate))}</div>
      </div>
    </div>

    ${
      room.notes
        ? `<div class="alert alert-info"><strong>📝 Notas:</strong> ${escapeHtml(room.notes)}</div>`
        : ''
    }

    ${botBannerHtml}
    ${secretSantaCardHtml}
    ${myWishlistHtml}
    ${participantsHtml}
    ${exclusionsHtml}
    ${organizerControlsHtml}
  `;

  attachAccessibleValidation(container);

  const reload = () => renderRoomView(container, code, onBackHome);

  container.querySelector('#btn-back-home')?.addEventListener('click', onBackHome);

  container.querySelector('#room-activate-bot')?.addEventListener('click', async () => {
    const ok = await activateBotMessages(botUsername, room.code);
    if (ok) await reload();
  });

  // Revelar / ocultar amigo invisible
  const toggleReveal = (show: boolean) => {
    targetRevealOpen = show;
    const hiddenEl = container.querySelector<HTMLElement>('#reveal-hidden-msg');
    const shownEl = container.querySelector<HTMLElement>('#reveal-shown-msg');
    const wishPanel = container.querySelector<HTMLElement>('#target-wishlist-panel');
    if (hiddenEl && shownEl && wishPanel) {
      hiddenEl.hidden = targetRevealOpen;
      shownEl.hidden = !targetRevealOpen;
      wishPanel.hidden = !targetRevealOpen;
    }
  };
  container.querySelector('#btn-toggle-reveal')?.addEventListener('click', () => toggleReveal(true));
  container.querySelector('#btn-hide-reveal')?.addEventListener('click', () => toggleReveal(false));

  // Abrir enlaces de regalos externos de forma segura
  container.querySelectorAll<HTMLElement>('[data-open-url], [data-ext-url]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const targetUrl = el.dataset.openUrl || el.dataset.extUrl;
      if (targetUrl) {
        e.preventDefault();
        openExternalUrl(targetUrl);
      }
    });
  });

  // Añadir / editar regalo en mi lista
  container.querySelector('#btn-add-wish')?.addEventListener('click', () => {
    openWishlistDialog({
      mode: 'add',
      onSubmit: async (vals) => {
        await api.addWishlistItem(room.code, vals);
        showToast('🎁 Idea añadida a tu lista');
        await reload();
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-edit-wish]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.editWish;
      const item = me.wishlist.find((w) => w.id === id);
      if (!item) return;
      openWishlistDialog({
        mode: 'edit',
        initial: item,
        onSubmit: async (vals) => {
          await api.updateWishlistItem(room.code, item.id, vals);
          showToast('✏️ Lista actualizada');
          await reload();
        }
      });
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-del-wish]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delWish;
      if (!id) return;
      try {
        await api.deleteWishlistItem(room.code, id);
        showToast('Regalo eliminado');
        await reload();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Error al eliminar');
      }
    });
  });

  // Invitar contactos de Telegram / copiar enlace
  container.querySelector('#btn-share-telegram')?.addEventListener('click', () => {
    shareViaTelegram(inviteLink, shareText);
  });

  container.querySelector('#btn-copy-link')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      showToast('📋 Enlace copiado');
    } catch {
      showToast(inviteLink);
    }
  });

  // Enviar enlace personal a contacto pre-añadido
  container.querySelectorAll<HTMLButtonElement>('[data-share-claim]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.shareClaim;
      const name = btn.dataset.claimName || 'amigo';
      if (!url) return;
      shareViaTelegram(
        url,
        `🎄 ¡Hola ${name}! Te he añadido a nuestro Amigo Invisible "${room.title}". Toca este enlace para entrar y poner tu lista de regalos:`
      );
    });
  });

  // Añadir contacto manual
  const addContactForm = container.querySelector<HTMLFormElement>('#add-contact-form');
  if (addContactForm) {
    const btn = addContactForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    addContactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateAndFocusFirstInvalid(addContactForm)) return;
      const fd = new FormData(addContactForm);
      const displayName = String(fd.get('displayName') ?? '').trim();
      const telegramUsername = String(fd.get('telegramUsername') ?? '').trim();

      btn.disabled = true;
      try {
        await api.addParticipant(room.code, { displayName, telegramUsername });
        showToast(`👤 ${displayName} añadido a la sala`);
        await reload();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Error al añadir contacto');
        btn.disabled = false;
      }
    });
  }

  // Eliminar participante
  container.querySelectorAll<HTMLButtonElement>('[data-del-participant]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delParticipant;
      const name = btn.dataset.delName || 'este participante';
      if (!id) return;
      const ok = await openConfirmDialog({
        title: `¿Quitar a ${name}?`,
        description: 'Se eliminará de este sorteo junto con su lista y exclusiones.',
        confirmLabel: 'Quitar',
        destructive: true
      });
      if (!ok) return;
      try {
        await api.removeParticipant(room.code, id);
        showToast('Participante eliminado');
        await reload();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'No se pudo quitar');
      }
    });
  });

  // Exclusiones
  const addExForm = container.querySelector<HTMLFormElement>('#add-exclusion-form');
  if (addExForm) {
    const btn = addExForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    addExForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(addExForm);
      const giverId = String(fd.get('giverId') ?? '');
      const excludedReceiverId = String(fd.get('excludedReceiverId') ?? '');
      const mutual = fd.get('mutual') === 'on';
      if (giverId === excludedReceiverId) {
        showToast('Elige dos participantes diferentes');
        return;
      }
      btn.disabled = true;
      try {
        await api.addExclusion(room.code, { giverId, excludedReceiverId, mutual });
        showToast('🚫 Exclusión añadida');
        await reload();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'No se pudo añadir la exclusión');
        btn.disabled = false;
      }
    });
  }

  container.querySelectorAll<HTMLButtonElement>('[data-del-exclusion]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delExclusion;
      if (!id) return;
      try {
        await api.deleteExclusion(room.code, id);
        showToast('Exclusión eliminada');
        await reload();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Error');
      }
    });
  });

  // Realizar sorteo / Re-sortear
  const executeDraw = async (redraw: boolean) => {
    const confirmed = await openConfirmDialog({
      title: redraw ? '¿Volver a sortear?' : '¿Realizar el sorteo ahora?',
      description: redraw
        ? 'Se generarán nuevas parejas y el bot avisará por privado a todos los participantes conectados.'
        : `Se sortearán ${participants.length} participantes respetando ${exclusions.length} exclusiones y el bot les enviará su amigo invisible por privado.`,
      confirmLabel: redraw ? 'Sí, re-sortear' : '🎲 Sortear y avisar',
      destructive: redraw
    });
    if (!confirmed) return;

    try {
      const res = await api.runDraw(room.code, redraw);
      if (res.pendingParticipants.length === 0) {
        showToast(`🎉 ¡Sorteado! Avisados ${res.notifiedCount}/${res.totalParticipants} por el bot`);
      } else {
        showToast(
          `🎲 Sorteado (${res.notifiedCount}/${res.totalParticipants} avisados). Pendientes: ${res.pendingParticipants.join(
            ', '
          )}`
        );
      }
      await reload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo completar el sorteo');
    }
  };

  container.querySelector('#btn-run-draw')?.addEventListener('click', () => executeDraw(false));
  container.querySelector('#btn-redraw')?.addEventListener('click', () => executeDraw(true));

  // Recordar a pendientes
  container.querySelector('#btn-remind-pending')?.addEventListener('click', async () => {
    try {
      const res = await api.remindPending(room.code);
      if (res.sentCount === 0 && res.unreachableNames.length === 0) {
        showToast('✅ Todos tienen lista y el bot activado');
      } else if (res.unreachableNames.length > 0) {
        showToast(
          `📨 Enviados ${res.sentCount} avisos. Sin bot activo: ${res.unreachableNames.join(', ')}`
        );
      } else {
        showToast(`⏰ Recordatorio enviado por el bot a ${res.sentCount} participante(s)`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error enviando recordatorios');
    }
  });

  // Editar y eliminar sala
  container.querySelector('#btn-edit-room')?.addEventListener('click', () => {
    openRoomFormDialog({
      mode: 'edit',
      initial: {
        title: room.title,
        maxBudget: room.maxBudget,
        currency: room.currency,
        revealDate: room.revealDate,
        notes: room.notes
      },
      onSubmit: async (values) => {
        await api.updateRoom(room.code, values);
        showToast('✅ Sorteo actualizado');
        await reload();
      }
    });
  });

  container.querySelector('#btn-delete-room')?.addEventListener('click', async () => {
    const ok = await openConfirmDialog({
      title: `¿Eliminar "${room.title}"?`,
      description: 'Se borrarán todos los participantes, listas de deseos y resultados de forma permanente.',
      confirmLabel: 'Eliminar sorteo',
      destructive: true
    });
    if (!ok) return;
    try {
      await api.deleteRoom(room.code);
      showToast('Sorteo eliminado');
      onBackHome();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  });
}

function openWishlistDialog(params: {
  mode: 'add' | 'edit';
  initial?: WishlistItemDto;
  onSubmit: (values: { title: string; url: string; notes: string }) => Promise<void>;
}): void {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('closedby', 'any');
  const titleId = `wish-modal-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', titleId);

  const init = params.initial ?? { title: '', url: '', notes: '' };

  dialog.innerHTML = `
    <div class="dialog-header">
      <h2 id="${titleId}" class="dialog-title">
        ${params.mode === 'add' ? '🎁 Añadir idea de regalo' : '✏️ Editar regalo'}
      </h2>
      <button type="button" class="btn-secondary btn-sm" data-close aria-label="Cerrar diálogo">✕</button>
    </div>
    <form class="form-stack" novalidate>
      <div class="field">
        <label for="wish-title-input">¿Qué te gustaría recibir? *</label>
        <input
          id="wish-title-input"
          name="title"
          type="text"
          required
          minlength="1"
          maxlength="120"
          autofocus
          enterkeyhint="next"
          data-error="wish-title-error"
          value="${escapeHtml(init.title)}"
          placeholder="Ej. Libro de cocina japonesa"
        />
        <div id="wish-title-error" class="error-msg">
          <span role="img" aria-label="Error">❌</span> Describe el regalo que quieres añadir.
        </div>
      </div>

      <div class="field">
        <label for="wish-notes-input">Detalles, talla, color o preferencia (opcional)</label>
        <input
          id="wish-notes-input"
          name="notes"
          type="text"
          maxlength="200"
          enterkeyhint="next"
          value="${escapeHtml(init.notes)}"
          placeholder="Ej. Talla M, color verde oscuro"
        />
      </div>

      <div class="field">
        <label for="wish-url-input">Enlace de referencia (opcional)</label>
        <input
          id="wish-url-input"
          name="url"
          type="url"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
          enterkeyhint="done"
          data-error="wish-url-error"
          value="${escapeHtml(init.url)}"
          placeholder="https://..."
        />
        <div id="wish-url-error" class="error-msg">
          <span role="img" aria-label="Error">❌</span> Introduce una URL válida (empezando por https://).
        </div>
      </div>

      <div class="dialog-actions">
        <button type="button" class="btn-secondary" data-close>Cancelar</button>
        <button type="submit" class="btn-primary">
          ${params.mode === 'add' ? 'Añadir a mi lista' : 'Guardar cambios'}
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
    const notes = String(fd.get('notes') ?? '').trim();
    const url = String(fd.get('url') ?? '').trim();

    submitBtn.disabled = true;
    try {
      await params.onSubmit({ title, url, notes });
      dialog.close();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar');
      submitBtn.disabled = false;
    }
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}
