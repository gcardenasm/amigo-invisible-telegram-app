import { computeDaysUntilReveal, formatCountdownLabel } from '../../shared/countdown';
import type {
  AnonymousMessageDto,
  ExclusionDto,
  GiftStatus,
  ParticipantDto,
  WishlistItemDto
} from '../../shared/types';
import { api } from '../api';
import { openConfirmDialog, setupModalDialog } from '../dialog';
import {
  getTelegramWebApp,
  hapticImpact,
  hapticNotification,
  hapticSelection,
  normalizeBotUsernameClient,
  openExternalUrl,
  sharePreparedTelegramMessage,
  shareViaTelegram
} from '../telegram-sdk';
import { attachAccessibleValidation, validateAndFocusFirstInvalid } from '../validation';
import {
  activateBotMessages,
  escapeHtml,
  formatBudget,
  formatRevealDate,
  openRoomFormDialog,
  showToast,
  tryQuickWriteAccess
} from './components';

const autoPromptedRooms = new Set<string>();

function renderChatThreadHtml(
  messages: AnonymousMessageDto[],
  viewerRole: 'giver' | 'receiver',
  otherLabel: string
): string {
  if (messages.length === 0) {
    return `<p class="muted" style="margin:0;">Aún no hay mensajes. Escribe por aquí de forma 100 % anónima.</p>`;
  }

  return `
    <div class="chat-thread" role="log" aria-live="polite">
      ${messages
        .map((m) => {
          const isMine = m.senderRole === viewerRole;
          return `
            <div class="chat-bubble ${isMine ? 'chat-bubble-mine' : 'chat-bubble-other'}">
              <div class="chat-meta">${isMine ? 'Tú' : escapeHtml(otherLabel)}</div>
              <div>${escapeHtml(m.body)}</div>
            </div>`;
        })
        .join('')}
    </div>`;
}

function triggerConfettiBurst(boxEl: Element | null): void {
  if (!boxEl) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const burst = document.createElement('div');
  burst.className = 'confetti-burst';
  burst.setAttribute('aria-hidden', 'true');
  const colors = ['#2481cc', '#ef4444', '#22c55e', '#f59e0b', '#ec4899'];

  for (let i = 0; i < 18; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.35;
    const dist = 55 + Math.random() * 85;
    piece.style.setProperty('--tx', `${Math.round(Math.cos(angle) * dist)}px`);
    piece.style.setProperty('--ty', `${Math.round(Math.sin(angle) * dist - 20)}px`);
    piece.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 520)}deg`);
    piece.style.backgroundColor = colors[i % colors.length]!;
    burst.append(piece);
  }

  boxEl.append(burst);
  window.setTimeout(() => {
    burst.remove();
  }, 1400);
}

export async function renderRoomView(
  container: HTMLElement,
  code: string,
  onBackHome: () => void
): Promise<void> {
  const detail = await api.getRoom(code);
  const {
    room,
    me,
    participants,
    exclusions,
    myTarget,
    santaMessages,
    revealedPairs,
    botUsername
  } = detail;

  const cleanBotUsername = normalizeBotUsernameClient(botUsername);
  const participantMap = new Map(participants.map((p) => [p.id, p]));
  const inviteLink = `https://t.me/${cleanBotUsername}?startapp=join_${room.code}`;
  const shareText = `🎄 ¡Únete a nuestro Amigo Invisible "${room.title}"! Importe máx: ${formatBudget(
    room.maxBudget,
    room.currency
  )} · Día: ${formatRevealDate(room.revealDate)}. Entra y pon tu lista de regalos:`;

  const countdownText = formatCountdownLabel(computeDaysUntilReveal(room.revealDate));
  const isPostDraw = room.status === 'drawn' || room.status === 'revealed';
  const progressPct =
    room.participantCount > 0
      ? Math.round((room.giftsReadyCount / room.participantCount) * 100)
      : 0;

  let targetRevealOpen = false;

  const botBannerHtml = !me.botReachable
    ? `
    <div class="alert alert-warn">
      <div><strong>🔔 Activa los mensajes privados del bot</strong></div>
      <div>Para recibir en privado quién te ha tocado y enterarte si cambia su lista de regalos, activa el bot con un toque.</div>
      <button type="button" id="room-activate-bot" class="btn-primary btn-sm">Activar avisos del bot</button>
    </div>`
    : '';

  const revealedBannerHtml =
    room.status === 'revealed' && revealedPairs && revealedPairs.length > 0
      ? `
      <section class="card card-hero" aria-labelledby="revealed-heading">
        <div class="section-header">
          <h2 id="revealed-heading" class="section-title">🎉 ¡Revelación final!</h2>
          <span class="badge badge-success">Completado</span>
        </div>
        <p class="muted" style="margin:0;">Así quedaron todos los emparejamientos del Amigo Invisible:</p>
        <ul class="reveal-chain">
          ${revealedPairs
            .map(
              (pair) => `
            <li class="reveal-chain-item">
              <strong>${escapeHtml(pair.giverName)}</strong>
              <span aria-hidden="true">🎁→</span>
              <strong>${escapeHtml(pair.receiverName)}</strong>
            </li>`
            )
            .join('')}
        </ul>
      </section>`
      : '';

  const targetPrefsHtml =
    myTarget && (myTarget.sizes || myTarget.allergies || myTarget.dislikes)
      ? `
      <div class="prefs-grid">
        ${
          myTarget.sizes
            ? `<div class="pref-chip"><strong>📏 Tallas:</strong> ${escapeHtml(myTarget.sizes)}</div>`
            : ''
        }
        ${
          myTarget.allergies
            ? `<div class="pref-chip"><strong>⚠️ Alergias:</strong> ${escapeHtml(myTarget.allergies)}</div>`
            : ''
        }
        ${
          myTarget.dislikes
            ? `<div class="pref-chip"><strong>🚫 Evitar / No regalar:</strong> ${escapeHtml(myTarget.dislikes)}</div>`
            : ''
        }
      </div>`
      : '';

  const secretSantaCardHtml =
    isPostDraw && myTarget
      ? `
      <section class="card card-hero" aria-labelledby="target-heading">
        <div class="section-header">
          <h2 id="target-heading" class="section-title">🤫 Tu Amigo Invisible</h2>
          <span class="badge badge-success">${
            room.status === 'revealed' ? 'Revelado' : 'Sorteado'
          }</span>
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

        <div id="target-wishlist-panel" hidden style="display:flex;flex-direction:column;gap:0.75rem;">
          ${targetPrefsHtml}

          <div>
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

          <div>
            <h3 class="section-title" style="font-size:0.92rem;margin-bottom:0.35rem;">
              🛍️ Tu progreso privado (nadie ve quién eres)
            </h3>
            <div class="segmented" role="group" aria-label="Estado de compra del regalo">
              <button type="button" class="segmented-btn" data-gift-status="pending" aria-pressed="${
                me.giftStatus === 'pending' ? 'true' : 'false'
              }">⏳ Pendiente</button>
              <button type="button" class="segmented-btn" data-gift-status="bought" aria-pressed="${
                me.giftStatus === 'bought' ? 'true' : 'false'
              }">🛍️ Comprado</button>
              <button type="button" class="segmented-btn" data-gift-status="wrapped" aria-pressed="${
                me.giftStatus === 'wrapped' ? 'true' : 'false'
              }">🎀 Envuelto</button>
            </div>
          </div>

          ${
            room.status === 'drawn'
              ? `
            <div style="border-top:1px solid var(--border);padding-top:0.75rem;display:flex;flex-direction:column;gap:0.5rem;">
              <h3 class="section-title" style="font-size:0.92rem;">
                💬 Preguntar anónimamente a ${escapeHtml(myTarget.displayName)}
              </h3>
              ${renderChatThreadHtml(myTarget.chatMessages, 'giver', myTarget.displayName)}
              <form id="chat-to-target-form" class="chat-form" novalidate>
                <label class="visually-hidden" for="chat-target-input">Pregunta anónima</label>
                <input
                  id="chat-target-input"
                  name="body"
                  type="text"
                  required
                  maxlength="400"
                  enterkeyhint="send"
                  placeholder="Ej. ¿Qué talla usas o tienes ya...?"
                />
                <button type="submit" class="btn-primary btn-sm">Enviar</button>
              </form>
            </div>`
              : ''
          }
        </div>
      </section>`
      : '';

  const santaInboxHtml =
    room.status === 'drawn'
      ? `
      <section class="card" aria-labelledby="santa-chat-heading">
        <div class="section-header">
          <h2 id="santa-chat-heading" class="section-title">🎅 Mensajes de tu Amigo Invisible</h2>
          <span class="badge badge-neutral">${santaMessages.length}</span>
        </div>
        <p class="muted" style="margin:0;">
          Quien te regala puede escribirte de forma anónima a través del bot para resolver dudas.
        </p>
        ${renderChatThreadHtml(santaMessages, 'receiver', '🎅 Tu Amigo Invisible')}
        <form id="chat-to-santa-form" class="chat-form" novalidate>
          <label class="visually-hidden" for="chat-santa-input">Responder a tu amigo invisible</label>
          <input
            id="chat-santa-input"
            name="body"
            type="text"
            required
            maxlength="400"
            enterkeyhint="send"
            placeholder="Responder o dejar una pista..."
          />
          <button type="submit" class="btn-secondary btn-sm">Responder</button>
        </form>
      </section>`
      : '';

  const myProfileSummaryHtml = `
    <div class="prefs-grid">
      <div class="pref-chip">
        <strong>👤 Tu nombre en esta sala:</strong> ${escapeHtml(me.displayName)}
      </div>
      ${
        me.sizes
          ? `<div class="pref-chip"><strong>📏 Tallas:</strong> ${escapeHtml(me.sizes)}</div>`
          : ''
      }
      ${
        me.allergies
          ? `<div class="pref-chip"><strong>⚠️ Alergias:</strong> ${escapeHtml(me.allergies)}</div>`
          : ''
      }
      ${
        me.dislikes
          ? `<div class="pref-chip"><strong>🚫 Qué NO regalarme:</strong> ${escapeHtml(me.dislikes)}</div>`
          : ''
      }
    </div>
    <button type="button" id="btn-edit-profile" class="btn-secondary btn-sm" style="align-self:flex-start;">
      ✏️ Editar nombre, tallas y qué no regalarme
    </button>`;

  const myWishlistHtml = `
    <section class="card" aria-labelledby="my-wishlist-heading">
      <div class="section-header">
        <h2 id="my-wishlist-heading" class="section-title">🎁 Mi lista de regalos y gustos</h2>
        <span class="badge badge-neutral">${me.wishlist.length}</span>
      </div>
      ${myProfileSummaryHtml}
      <p class="muted" style="margin:0;">
        Añade tus preferencias en forma de lista para ayudar a quien le hayas tocado.${
          room.status === 'drawn'
            ? ' Si cambias tus gustos o lista, el bot avisará por privado a tu Amigo Invisible.'
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
                ? `https://t.me/${cleanBotUsername}?startapp=claim_${p.claimToken}`
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
                    personalLink && p.claimToken
                      ? `<button type="button" class="btn-secondary btn-sm" data-share-claim="${escapeHtml(
                          personalLink
                        )}" data-claim-token="${escapeHtml(
                          p.claimToken
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
            : room.status === 'drawn'
            ? `<button type="button" id="btn-reveal-all" class="btn-primary">🎉 Revelar amigos invisibles</button>`
            : ''
        }
      </div>
      ${
        room.status === 'drawn'
          ? `<button type="button" id="btn-redraw" class="btn-secondary btn-sm">🔄 Volver a sortear</button>`
          : ''
      }
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
    : room.status === 'open'
    ? `
    <section class="card">
      <button type="button" id="btn-leave-room" class="btn-danger btn-sm">🚪 Salir de este sorteo</button>
    </section>`
    : '';

  const statusBadgeClass = room.status === 'open' ? 'badge-warn' : 'badge-success';
  const statusBadgeText =
    room.status === 'revealed'
      ? '🎉 Revelado'
      : room.status === 'drawn'
      ? '🎲 Sorteado'
      : '⏳ Abierto';

  container.innerHTML = `
    <header class="header-bar">
      <div style="min-width:0;">
        <button type="button" id="btn-back-home" class="btn-secondary btn-sm" style="margin-bottom:0.45rem;">← Mis sorteos</button>
        <h1 class="header-title">${escapeHtml(room.title)}</h1>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.35rem;">
        <span class="badge ${statusBadgeClass}">${statusBadgeText}</span>
        ${countdownText ? `<span class="badge badge-neutral">${escapeHtml(countdownText)}</span>` : ''}
      </div>
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
      room.status === 'drawn'
        ? `
      <div class="card">
        <div class="progress-wrap">
          <div class="progress-header">
            <span>🎁 Regalos preparados en el grupo</span>
            <span>${room.giftsReadyCount} de ${room.participantCount}</span>
          </div>
          <div class="progress-bar" role="progressbar" aria-valuenow="${room.giftsReadyCount}" aria-valuemin="0" aria-valuemax="${room.participantCount}">
            <div class="progress-fill" style="width:${progressPct}%;"></div>
          </div>
        </div>
      </div>`
        : ''
    }

    ${
      room.notes
        ? `<div class="alert alert-info"><strong>📝 Notas:</strong> ${escapeHtml(room.notes)}</div>`
        : ''
    }

    ${botBannerHtml}
    ${revealedBannerHtml}
    ${secretSantaCardHtml}
    ${santaInboxHtml}
    ${myWishlistHtml}
    ${participantsHtml}
    ${exclusionsHtml}
    ${organizerControlsHtml}
  `;

  attachAccessibleValidation(container);

  const reload = () => renderRoomView(container, code, onBackHome);

  if (!me.botReachable && !autoPromptedRooms.has(room.code) && getTelegramWebApp()?.requestWriteAccess) {
    autoPromptedRooms.add(room.code);
    void tryQuickWriteAccess(room.code).then((ok) => {
      if (ok && container.querySelector('#room-activate-bot')) {
        void reload();
      }
    });
  }

  container.querySelector('#btn-back-home')?.addEventListener('click', onBackHome);

  container.querySelector('#room-activate-bot')?.addEventListener('click', async () => {
    const ok = await activateBotMessages(botUsername, room.code);
    if (ok) await reload();
  });

  // Revelar / ocultar amigo invisible (respetando prefers-reduced-motion)
  const toggleReveal = (show: boolean) => {
    targetRevealOpen = show;
    const hiddenEl = container.querySelector<HTMLElement>('#reveal-hidden-msg');
    const shownEl = container.querySelector<HTMLElement>('#reveal-shown-msg');
    const wishPanel = container.querySelector<HTMLElement>('#target-wishlist-panel');
    if (hiddenEl && shownEl && wishPanel) {
      hiddenEl.hidden = targetRevealOpen;
      shownEl.hidden = !targetRevealOpen;
      wishPanel.style.display = targetRevealOpen ? 'flex' : 'none';
      wishPanel.hidden = !targetRevealOpen;
      if (targetRevealOpen) {
        hapticNotification('success');
        shownEl.classList.remove('reveal-pop');
        void shownEl.offsetWidth;
        shownEl.classList.add('reveal-pop');
        triggerConfettiBurst(container.querySelector('.reveal-box'));
      }
    }
  };
  container.querySelector('#btn-toggle-reveal')?.addEventListener('click', () => toggleReveal(true));
  container.querySelector('#btn-hide-reveal')?.addEventListener('click', () => toggleReveal(false));

  // Progreso privado del regalo
  container.querySelectorAll<HTMLButtonElement>('[data-gift-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nextStatus = btn.dataset.giftStatus as GiftStatus | undefined;
      if (!nextStatus) return;
      hapticSelection();
      try {
        await api.updateGiftStatus(room.code, nextStatus);
        showToast('🛍️ Progreso guardado');
        await reload();
        toggleReveal(true);
      } catch (err) {
        hapticNotification('error');
        showToast(err instanceof Error ? err.message : 'No se pudo actualizar el estado');
      }
    });
  });

  // Chats anónimos a través del bot
  const bindAnonymousChat = (formId: string, thread: 'to_target' | 'to_santa', keepRevealed: boolean) => {
    const form = container.querySelector<HTMLFormElement>(formId);
    if (!form) return;
    const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateAndFocusFirstInvalid(form)) return;
      const body = String(new FormData(form).get('body') ?? '').trim();
      if (!body) return;
      btn.disabled = true;
      try {
        await api.sendAnonymousMessage(room.code, { thread, body });
        hapticNotification('success');
        showToast('💬 Mensaje anónimo enviado');
        await reload();
        if (keepRevealed) toggleReveal(true);
      } catch (err) {
        hapticNotification('error');
        showToast(err instanceof Error ? err.message : 'No se pudo enviar');
        btn.disabled = false;
      }
    });
  };
  bindAnonymousChat('#chat-to-target-form', 'to_target', true);
  bindAnonymousChat('#chat-to-santa-form', 'to_santa', false);

  // Editar nombre visible y preferencias (tallas, alergias, no regalar)
  container.querySelector('#btn-edit-profile')?.addEventListener('click', () => {
    openProfileDialog({
      initial: {
        displayName: me.displayName,
        sizes: me.sizes,
        allergies: me.allergies,
        dislikes: me.dislikes
      },
      onSubmit: async (vals) => {
        await api.updateProfile(room.code, vals);
        hapticNotification('success');
        showToast('✅ Perfil de gustos actualizado');
        await reload();
      }
    });
  });

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
  const shareInteractiveOrFallback = async (
    triggerBtn: HTMLButtonElement,
    fallbackUrl: string,
    fallbackText: string,
    claimToken?: string
  ) => {
    const wa = getTelegramWebApp();
    if (!wa?.shareMessage) {
      shareViaTelegram(fallbackUrl, fallbackText);
      return;
    }

    triggerBtn.disabled = true;
    try {
      const prepared = await api.prepareShareMessage(
        room.code,
        claimToken ? { claimToken } : undefined
      );
      if (prepared.preparedMessageId) {
        const outcome = await sharePreparedTelegramMessage(prepared.preparedMessageId);
        if (outcome === 'sent') {
          showToast('📨 Invitación enviada');
          return;
        }
        if (outcome === 'cancelled') {
          return;
        }
      }
      shareViaTelegram(prepared.inviteUrl || fallbackUrl, fallbackText);
    } catch {
      shareViaTelegram(fallbackUrl, fallbackText);
    } finally {
      triggerBtn.disabled = false;
    }
  };

  const shareBtn = container.querySelector<HTMLButtonElement>('#btn-share-telegram');
  shareBtn?.addEventListener('click', () => {
    void shareInteractiveOrFallback(shareBtn, inviteLink, shareText);
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
      const claimToken = btn.dataset.claimToken;
      const name = btn.dataset.claimName || 'amigo';
      if (!url) return;
      void shareInteractiveOrFallback(
        btn,
        url,
        `🎄 ¡Hola ${name}! Te he añadido a nuestro Amigo Invisible "${room.title}". Toca este enlace para entrar y poner tu lista de regalos:`,
        claimToken
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
      hapticNotification('success');
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
      hapticNotification('error');
      showToast(err instanceof Error ? err.message : 'No se pudo completar el sorteo');
    }
  };

  container.querySelector('#btn-run-draw')?.addEventListener('click', () => executeDraw(false));
  container.querySelector('#btn-redraw')?.addEventListener('click', () => executeDraw(true));

  container.querySelector('#btn-reveal-all')?.addEventListener('click', async () => {
    const ok = await openConfirmDialog({
      title: '¿Revelar todos los emparejamientos?',
      description:
        'Todo el grupo podrá ver quién regaló a quién y el bot enviará el resumen final a los participantes conectados.',
      confirmLabel: '🎉 Revelar ahora',
      destructive: true
    });
    if (!ok) return;
    try {
      const res = await api.revealRoom(room.code);
      hapticNotification('success');
      showToast(
        `🎉 ¡Revelación enviada! Notificados ${res.notifiedCount}/${res.totalParticipants}`
      );
      await reload();
    } catch (err) {
      hapticNotification('error');
      showToast(err instanceof Error ? err.message : 'No se pudo completar la revelación');
    }
  });

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
      hapticImpact('medium');
      showToast('Sorteo eliminado');
      onBackHome();
    } catch (err) {
      hapticNotification('error');
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  });

  container.querySelector('#btn-leave-room')?.addEventListener('click', async () => {
    const ok = await openConfirmDialog({
      title: `¿Salir de "${room.title}"?`,
      description: 'Se borrará tu participación y tu lista de regalos de esta sala.',
      confirmLabel: 'Salir del sorteo',
      destructive: true
    });
    if (!ok) return;
    try {
      await api.leaveRoom(room.code);
      hapticImpact('light');
      showToast('Has salido del sorteo');
      onBackHome();
    } catch (err) {
      hapticNotification('error');
      showToast(err instanceof Error ? err.message : 'No se pudo salir del sorteo');
    }
  });
}

function openProfileDialog(params: {
  initial: { displayName: string; sizes: string; allergies: string; dislikes: string };
  onSubmit: (values: {
    displayName: string;
    sizes: string;
    allergies: string;
    dislikes: string;
  }) => Promise<void>;
}): void {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('closedby', 'any');
  const titleId = `profile-modal-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', titleId);

  dialog.innerHTML = `
    <div class="dialog-header">
      <h2 id="${titleId}" class="dialog-title">✏️ Tu nombre y perfil de gustos</h2>
      <button type="button" class="btn-secondary btn-sm" data-close aria-label="Cerrar diálogo">✕</button>
    </div>
    <form class="form-stack" novalidate>
      <div class="field">
        <label for="prof-name-input">Nombre visible en este sorteo *</label>
        <input
          id="prof-name-input"
          name="displayName"
          type="text"
          required
          minlength="1"
          maxlength="60"
          autofocus
          enterkeyhint="next"
          data-error="prof-name-error"
          value="${escapeHtml(params.initial.displayName)}"
        />
        <div id="prof-name-error" class="error-msg">
          <span role="img" aria-label="Error">❌</span> Escribe un nombre visible (1-60 caracteres).
        </div>
      </div>

      <div class="field">
        <label for="prof-sizes-input">Tallas de ropa o calzado (opcional)</label>
        <input
          id="prof-sizes-input"
          name="sizes"
          type="text"
          maxlength="200"
          enterkeyhint="next"
          value="${escapeHtml(params.initial.sizes)}"
          placeholder="Ej. Camiseta M, pie 42"
        />
      </div>

      <div class="field">
        <label for="prof-allergies-input">Alergias o intolerancias (opcional)</label>
        <input
          id="prof-allergies-input"
          name="allergies"
          type="text"
          maxlength="200"
          enterkeyhint="next"
          value="${escapeHtml(params.initial.allergies)}"
          placeholder="Ej. Frutos secos, lactosa"
        />
      </div>

      <div class="field">
        <label for="prof-dislikes-input">Qué NO regalarme / evitar (opcional)</label>
        <textarea
          id="prof-dislikes-input"
          name="dislikes"
          maxlength="200"
          placeholder="Ej. Nada de tazas, colonias ni ropa"
        >${escapeHtml(params.initial.dislikes)}</textarea>
      </div>

      <div class="dialog-actions">
        <button type="button" class="btn-secondary" data-close>Cancelar</button>
        <button type="submit" class="btn-primary">Guardar perfil</button>
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
    const displayName = String(fd.get('displayName') ?? '').trim();
    const sizes = String(fd.get('sizes') ?? '').trim();
    const allergies = String(fd.get('allergies') ?? '').trim();
    const dislikes = String(fd.get('dislikes') ?? '').trim();

    submitBtn.disabled = true;
    try {
      await params.onSubmit({ displayName, sizes, allergies, dislikes });
      dialog.close();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar');
      submitBtn.disabled = false;
    }
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
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
