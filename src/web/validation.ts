let announcerEl: HTMLElement | null = null;
let announceTimer: number | undefined;
let announcedField: Element | null = null;

function getAnnouncer(): HTMLElement {
  if (!announcerEl) {
    announcerEl = document.createElement('div');
    announcerEl.setAttribute('aria-live', 'polite');
    announcerEl.className = 'visually-hidden';
    document.body.append(announcerEl);
  }
  return announcerEl;
}

function linkError(el: HTMLElement, shown: boolean): void {
  const errorId = el.dataset.error;
  if (!errorId) return;
  const ids = (el.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (shown) ids.push(errorId);
  if (ids.length > 0) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
}

function announceError(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  const errorId = el.dataset.error;
  if (!errorId) return;
  const errorNode = document.getElementById(errorId);
  if (!errorNode) return;
  const labelText = el.labels?.[0]?.textContent?.trim() || '';
  const msgText = errorNode.textContent?.replace(/\s+/g, ' ').trim() || '';
  const announcer = getAnnouncer();

  window.clearTimeout(announceTimer);
  announcer.textContent = '';
  announcedField = el;
  announceTimer = window.setTimeout(() => {
    announcer.textContent = labelText ? `${labelText}: ${msgText}` : msgText;
  }, 500);
}

/**
 * Sincroniza aria-invalid, aria-describedby, anuncios aria-live y fallback
 * para navegadores sin :user-invalid usando WeakMap.
 */
export function attachAccessibleValidation(root: ParentNode = document): void {
  const supportsUserInvalid =
    typeof CSS !== 'undefined' && CSS.supports && CSS.supports('selector(:user-invalid)');
  const dirtyState = new WeakMap<Element, { hasInteracted: boolean; hasBlurred: boolean }>();
  const flagged = new WeakSet<Element>();
  const announced = new WeakSet<Element>();

  const controls = root.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input, select, textarea');

  const syncControl = (
    el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    shouldAnnounce = false
  ) => {
    const isInvalid = supportsUserInvalid
      ? el.matches(':user-invalid')
      : el.classList.contains('user-invalid-fallback');

    if (isInvalid) {
      if (shouldAnnounce && !announced.has(el)) {
        announceError(el);
        announced.add(el);
      }
      el.setAttribute('aria-invalid', 'true');
      linkError(el, true);
      flagged.add(el);
    } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
      el.setAttribute('aria-invalid', 'false');
      linkError(el, false);
      flagged.delete(el);
      announced.delete(el);
      if (announcedField === el) {
        window.clearTimeout(announceTimer);
        getAnnouncer().textContent = '';
      }
    }
  };

  for (const el of controls) {
    if (!el.hasAttribute('aria-invalid')) {
      el.setAttribute('aria-invalid', 'false');
    }
  }

  root.addEventListener(
    'blur',
    (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      if (!supportsUserInvalid) {
        const st = dirtyState.get(target) ?? { hasInteracted: false, hasBlurred: false };
        st.hasBlurred = true;
        dirtyState.set(target, st);
        if (st.hasInteracted) {
          target.classList.toggle('user-invalid-fallback', !target.validity.valid);
        }
      }
      syncControl(target, true);
    },
    true
  );

  root.addEventListener('input', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    if (!supportsUserInvalid) {
      const st = dirtyState.get(target) ?? { hasInteracted: false, hasBlurred: false };
      st.hasInteracted = true;
      dirtyState.set(target, st);
      if (st.hasBlurred) {
        target.classList.toggle('user-invalid-fallback', !target.validity.valid);
      }
    }
    if (target.hasAttribute('aria-invalid')) {
      syncControl(target, false);
    }
  });

  root.addEventListener(
    'invalid',
    (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
        return;
      }
      if (!supportsUserInvalid) {
        dirtyState.set(target, { hasInteracted: true, hasBlurred: true });
        target.classList.add('user-invalid-fallback');
      }
      announced.add(target);
      syncControl(target, false);
    },
    true
  );
}

export function validateAndFocusFirstInvalid(form: HTMLFormElement): boolean {
  if (form.checkValidity()) return true;
  const firstInvalid = form.querySelector<HTMLElement>(':invalid');
  if (firstInvalid) {
    firstInvalid.focus();
  }
  return false;
}
