import { api, type MeResponse } from './api';
import { getStartParam, initTelegramApp, waitForTelegramSdk } from './telegram-sdk';
import { showToast } from './views/components';
import { renderHomeView } from './views/home';
import { renderRoomView } from './views/room';

const appEl = document.getElementById('app')!;

let cachedMe: MeResponse | null = null;
let currentRoute: { view: 'home' } | { view: 'room'; code: string } = { view: 'home' };

function syncTelegramBackButton(): void {
  const bb = window.Telegram?.WebApp?.BackButton;
  if (!bb) return;
  if (currentRoute.view === 'room') {
    bb.show();
  } else {
    bb.hide();
  }
}

async function render(): Promise<void> {
  syncTelegramBackButton();
  try {
    cachedMe = await api.getMe();
    if (currentRoute.view === 'room') {
      await renderRoomView(appEl, currentRoute.code, () => {
        currentRoute = { view: 'home' };
        void render();
      });
    } else {
      await renderHomeView(
        appEl,
        cachedMe,
        (code) => {
          currentRoute = { view: 'room', code };
          void render();
        },
        () => void render()
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    appEl.innerHTML = `
      <div class="card">
        <h1 class="header-title">⚠️ No se pudo cargar</h1>
        <p class="muted" style="margin:0;"></p>
        <button type="button" id="btn-retry" class="btn-primary">Reintentar</button>
      </div>
    `;
    appEl.querySelector('p')!.textContent = msg;
    appEl.querySelector('#btn-retry')?.addEventListener('click', () => void render());
  }
}

async function bootstrap(): Promise<void> {
  await waitForTelegramSdk();
  initTelegramApp();

  const bb = window.Telegram?.WebApp?.BackButton;
  bb?.onClick(() => {
    if (currentRoute.view === 'room') {
      currentRoute = { view: 'home' };
      void render();
    }
  });

  const startParam = getStartParam();
  if (startParam) {
    try {
      if (startParam.startsWith('join_')) {
        const res = await api.joinRoom({ roomCode: startParam.slice(5) });
        currentRoute = { view: 'room', code: res.code };
      } else if (startParam.startsWith('claim_')) {
        const res = await api.joinRoom({ claimToken: startParam.slice(6) });
        currentRoute = { view: 'room', code: res.code };
        showToast('✅ Plaza vinculada correctamente');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo procesar la invitación');
    }
  }

  await render();
}

void bootstrap();
