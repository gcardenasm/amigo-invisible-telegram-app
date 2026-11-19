# 🎅 Amigo Invisible · Mini App + Bot de Telegram

Alternativa gratuita, privada y de código abierto a `@santapartybot` para organizar sorteos de **Amigo Invisible** directamente dentro de Telegram.

Construida con **TypeScript + Vite** en el frontend y **Cloudflare Workers + Cloudflare D1 (SQLite)** en el backend, por lo que puedes alojarla **100 % gratis** (sin tarjeta de crédito, con HTTPS automático y sin servidores que se duerman por inactividad).

---

## ✨ Funcionalidades principales

- **Salas de sorteo completas:** configura el nombre del grupo, el **importe máximo** (con moneda elegible: EUR, USD, MXN, ARS, COP, CLP, GBP), el **día de revelación de regalos**, cuenta atrás en días y notas del evento.
- **Invitación interactiva a contactos de Telegram:**
  - Tarjeta interactiva con botón directo **«🎁 Abrir y unirme al sorteo»** (`savePreparedInlineMessage` + `shareMessage` e `inline_query` para invocar el bot en cualquier chat), con respaldo automático vía `t.me/share/url`.
  - Opción para **pre-añadir contactos manualmente** (nombre y `@usuario` opcional) y enviarles un enlace personal para reclamar su plaza.
  - Activación de mensajes privados del bot en 1 toque (`requestWriteAccess`) con indicador en tiempo real (`✅ Bot activo`).
- **Lista de regalos + perfil rápido de gustos:** cada participante crea su wishlist y puede editar su **nombre visible**, **tallas**, **alergias** y **qué NO regalar**, además de poder salir de la sala antes del sorteo.
- **Chat anónimo a través del bot:** quien regala puede enviar preguntas anónimas a su amigo invisible y recibir respuesta por privado y dentro de la Mini App sin desvelar su identidad.
- **Progreso privado del regalo y revelación final:** marca de forma privada si el regalo está *Pendiente*, *Comprado* o *Envuelto* (mostrando un contador anónimo grupal) y desbloquea todos los emparejamientos el día de la entrega con **«Revelar amigos invisibles»**.
- **Exclusiones y recordatorios automáticos:** evita parejas o familiares en el sorteo y envía recordatorios automáticos por Cron Trigger gratuito (7 días antes, 2 días antes y el mismo día del evento).
- **Experiencia nativa:** soporte automático de tema claro/oscuro, vibración háptica (`HapticFeedback`) y animaciones accesibles respetando `prefers-reduced-motion`.

---

## 🧠 ¿Cómo funciona con los contactos de Telegram?

Por política anti-spam de la API de Telegram, **ningún bot puede iniciar una conversación privada con un usuario solo con su `@usuario` o número de teléfono** si esa persona no ha interactuado antes con el bot.

Para resolverlo de forma fluida:
1. Quien organiza crea el sorteo y comparte el enlace de invitación (`?startapp=join_CODIGO`) con sus contactos desde la propia Mini App.
2. Al abrir el enlace, cada contacto queda unido a la sala, añade su lista de regalos y activa los avisos del bot con un toque (`requestWriteAccess` o `/start`).
3. Cuando todos están listos, el organizador pulsa **«Realizar sorteo ahora»** y el bot reparte las asignaciones por mensaje privado.

---

## 🏗️ Arquitectura y estructura del proyecto

```text
├── migrations/
│   ├── 0001_init.sql          # Esquema inicial SQLite para Cloudflare D1
│   └── 0002_v2_features.sql   # Perfil de gustos, chat anónimo, progreso y revelación
├── src/
│   ├── shared/
│   │   ├── types.ts           # Tipos compartidos entre Worker y Mini App
│   │   ├── countdown.ts       # Cuenta atrás y cálculo de hitos de recordatorio
│   │   └── draw.ts            # Algoritmo de sorteo con backtracking (MRV) y exclusiones
│   ├── worker/
│   │   ├── index.ts           # Entrada del Cloudflare Worker (API, Webhook, Assets y Cron)
│   │   ├── cron.ts            # Recordatorios automáticos diarios (7d, 2d, día D)
│   │   ├── auth.ts            # Validación HMAC-SHA256 de Telegram initData
│   │   ├── bot.ts             # Manejador del webhook (/start, /misorteos, inline_query)
│   │   ├── db.ts              # Consultas D1 y lógica de salas/notificaciones
│   │   ├── routes.ts          # API REST (/api/rooms, wishlist, chat, profile, reveal)
│   │   └── telegram.ts        # Cliente ligero de Telegram Bot API
│   └── web/
│       ├── index.html         # Mini App HTML con soporte light/dark y SDK de Telegram
│       ├── styles.css         # Estilos adaptados a Telegram ThemeParams
│       ├── main.ts            # Arranque, enrutado y BackButton de Telegram
│       ├── api.ts             # Cliente HTTP tipado
│       ├── telegram-sdk.ts    # Envoltorio de Telegram.WebApp + HapticFeedback + modo demo
│       ├── validation.ts      # Validación accesible de formularios
│       ├── dialog.ts          # Modales nativos <dialog> con light-dismiss
│       └── views/             # Vistas de inicio y detalle de sala
└── test/
    ├── auth.test.ts           # Tests de verificación criptográfica de initData
    ├── countdown.test.ts      # Tests de cuenta atrás y hitos automáticos
    ├── draw.test.ts           # Tests del algoritmo de sorteo y exclusiones
    └── telegram.test.ts       # Tests de URLs, mensajes y revelación final
```

Sin dependencias de producción en tiempo de ejecución: el Worker empaquetado ocupa ~13 KB comprimido (gzip).

---

## 💻 Desarrollo y pruebas en local

Requisitos: **Node.js 20+** y **npm**.

1. **Clona el repositorio e instala dependencias:**
   ```bash
   git clone https://github.com/gcardenasm/amigo-invisible-telegram-app.git
   cd amigo-invisible-telegram-app
   npm install
   ```

2. **Prepara los archivos de configuración local:**
   ```bash
   cp wrangler.example.toml wrangler.toml
   cp .dev.vars.example .dev.vars
   ```
   *(En Windows PowerShell usa `copy` en lugar de `cp`).*

3. **Crea la base de datos SQLite local:**
   ```bash
   npm run db:migrate:local
   ```

4. **Ejecuta tests y compilación:**
   ```bash
   npm test
   npm run build
   ```

5. **Arranca el entorno local:**
   - En **una sola terminal** (sirve API + frontend ya compilado en `http://127.0.0.1:8787`):
     ```bash
     npm run dev:worker
     ```
   - O en **dos terminales** con recarga en vivo de Vite (`http://localhost:5173`):
     ```bash
     npm run dev:worker
     npm run dev:web
     ```
   Con `DEV_MODE=true` en `.dev.vars`, la interfaz muestra un selector de usuarios simulados (**Gabriel, Laura, Carlos, Marta**) para probar todo el flujo completo sin necesidad de abrir Telegram.

---

## ☁️ Despliegue gratuito paso a paso (Cloudflare Workers + D1 + Telegram)

El plan gratuito de Cloudflare incluye **100.000 peticiones/día** y **5 GB de almacenamiento D1**, más que suficiente para múltiples grupos de amigos, familias o empresas.

### 1. Crear el bot en `@BotFather`
1. Abre [@BotFather](https://t.me/BotFather) en Telegram y envía `/newbot`.
2. Elige un nombre visible y un usuario terminado en `bot` (por ejemplo, `MiAmigoInvisibleBot`).
3. Guarda el **Token** que te entrega `@BotFather`.

### 2. Crear la base D1 y desplegar en Cloudflare
> **Nota para Windows:** si `wrangler` da timeout contra `api.cloudflare.com` por IPv6, ejecuta antes en tu terminal:
> `export NODE_OPTIONS="--dns-result-order=ipv4first"` (Bash) o `$env:NODE_OPTIONS="--dns-result-order=ipv4first"` (PowerShell).

1. Inicia sesión y crea tu base de datos D1:
   ```bash
   npx wrangler login
   npx wrangler d1 create amigo_invisible_db
   ```
2. Copia el `database_id` generado y pégalo en tu `wrangler.toml` local sustituyendo `REPLACE_WITH_YOUR_D1_DATABASE_ID` (manteniendo `binding = "DB"`).
3. Aplica el esquema SQL remoto:
   ```bash
   npm run db:migrate:remote
   ```
   *(Alternativa desde el navegador: en el panel de Cloudflare → **Storage & Databases** → **D1 SQL Database** → **Console**, ejecuta las sentencias `CREATE TABLE` / `CREATE INDEX` de `migrations/0001_init.sql` sin la línea inicial de comentario `--`).*
4. Despliega el Worker y la Mini App:
   ```bash
   npm run deploy
   ```
   Anota la URL HTTPS pública que te devuelve Wrangler (por ejemplo, `https://amigo-invisible-bot.tu-subdominio.workers.dev`).

### 3. Configurar los secretos en Cloudflare
No incluyas `DEV_MODE` en producción. Guarda estas 4 variables secretas con `wrangler`:
```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put BOT_USERNAME
npx wrangler secret put WEBAPP_URL
npx wrangler secret put WEBHOOK_SECRET
```
- `BOT_TOKEN`: el token de `@BotFather`.
- `BOT_USERNAME`: el usuario del bot **sin `@`**.
- `WEBAPP_URL`: tu URL pública `https://...workers.dev`.
- `WEBHOOK_SECRET`: una cadena aleatoria segura (caracteres `A-Z`, `a-z`, `0-9`, `_` y `-`).

### 4. Registrar el webhook y activar la Mini App en Telegram
1. Conecta el webhook de Telegram (sustituyendo `<BOT_TOKEN>`, `<WEBAPP_URL>` y `<WEBHOOK_SECRET>`):
   ```bash
   curl -4 -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url":"<WEBAPP_URL>/webhook/telegram","secret_token":"<WEBHOOK_SECRET>"}'
   ```
2. En `@BotFather`:
   - Envía `/mybots` → elige tu bot → **Bot Settings** → **Configure Mini App** → **Enable Mini App** → pega tu `<WEBAPP_URL>`.
   - Envía `/mybots` → elige tu bot → **Bot Settings** → **Inline Mode** → **Turn on** (habilita la invitación interactiva con botón directo).
   - Envía `/setmenubutton` → elige tu bot → pega tu `<WEBAPP_URL>` → texto del botón: `🎁 Abrir App`.

---

## 🧪 Scripts disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev:worker` | Inicia el Worker y D1 local en `http://127.0.0.1:8787` |
| `npm run dev:web` | Inicia el servidor Vite con recarga en caliente en `http://localhost:5173` |
| `npm test` | Ejecuta la suite de tests unitarios con Vitest |
| `npm run build` | Compila el frontend en `dist/web` y valida tipos TypeScript |
| `npm run db:migrate:local` | Aplica las migraciones SQL en D1 local |
| `npm run db:migrate:remote` | Aplica las migraciones SQL en D1 de producción |
| `npm run deploy` | Compila y despliega la Mini App + Worker en Cloudflare |

---

## 📄 Licencia

Este proyecto se distribuye bajo licencia MIT. Úsalo, modifícalo y despliégalo libremente para tus sorteos.
