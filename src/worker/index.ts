import { handleTelegramWebhook } from './bot';
import { handleScheduledReminders } from './cron';
import type { Env } from './env';
import { handleApiRequest } from './routes';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/webhook/telegram' && request.method === 'POST') {
      return handleTelegramWebhook(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env, url.pathname);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(handleScheduledReminders(env));
  }
} satisfies ExportedHandler<Env>;
