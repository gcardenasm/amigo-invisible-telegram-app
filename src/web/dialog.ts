/**
 * Inicializa diálogos nativos <dialog> con light-dismiss progresivo
 * y reseteo seguro de returnValue tras cerrar.
 */
export function setupModalDialog(dialog: HTMLDialogElement): void {
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    dialog.addEventListener('pointerdown', (e) => {
      if (dialog.getAttribute('closedby') === 'any') {
        pressedOutside = isOutside(e);
      }
    });
    dialog.addEventListener('pointerup', (e) => {
      if (dialog.getAttribute('closedby') === 'any' && pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    });
  }

  dialog.addEventListener('close', () => {
    dialog.returnValue = '';
  });
}

export function openConfirmDialog(params: {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('closedby', 'any');
    const titleId = `confirm-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby', titleId);

    const header = document.createElement('div');
    header.className = 'dialog-header';
    const h2 = document.createElement('h2');
    h2.id = titleId;
    h2.className = 'dialog-title';
    h2.textContent = params.title;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-secondary btn-sm';
    closeBtn.setAttribute('aria-label', 'Cerrar diálogo');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => dialog.close('cancel'));

    header.append(h2, closeBtn);

    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = params.description;

    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'submit';
    cancelBtn.value = 'cancel';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancelar';
    if (params.destructive) {
      cancelBtn.autofocus = true;
    }

    const okBtn = document.createElement('button');
    okBtn.type = 'submit';
    okBtn.value = 'confirm';
    okBtn.className = params.destructive ? 'btn-danger' : 'btn-primary';
    okBtn.textContent = params.confirmLabel;

    form.append(cancelBtn, okBtn);
    dialog.append(header, p, form);
    document.body.append(dialog);

    setupModalDialog(dialog);

    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      resolve(confirmed);
    });

    dialog.showModal();
  });
}
