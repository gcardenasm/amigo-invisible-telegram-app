export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BOT_TOKEN: string;
  BOT_USERNAME: string;
  WEBAPP_URL: string;
  WEBHOOK_SECRET?: string;
  DEV_MODE?: string;
}

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
}
