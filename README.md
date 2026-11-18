# 🎅 Amigo Invisible · Mini App + Bot de Telegram

Alternativa gratuita, privada y de código abierto a `@santapartybot` para organizar sorteos de **Amigo Invisible** directamente dentro de Telegram.

Construida con **TypeScript + Vite** en el frontend y **Cloudflare Workers + Cloudflare D1 (SQLite)** en el backend, por lo que puedes alojarla **100 % gratis** (sin tarjeta de crédito, con HTTPS automático y sin servidores que se duerman por inactividad).

---

## ✨ Funcionalidades principales

- **Salas de sorteo completas:** configura el nombre del grupo, el **importe máximo** (con moneda elegible: EUR, USD, MXN, ARS, COP, CLP, GBP), el **día de revelación de regalos** y notas del evento.
- **Invitación nativa a contactos de Telegram:**
  - Botón directo **«Invitar contactos de Telegram»** usando el selector nativo de Telegram (`t.me/share/url`).
  - Opción para **pre-añadir contactos manualmente** (nombre y `@usuario` opcional) y enviarles un enlace personal para reclamar su plaza.
  - Indicador en tiempo real por participante para saber quién ya entró y quién tiene **activado el bot** (`✅ Bot activo`) para recibir mensajes privados.
- **Lista de preferencias de regalo (Wishlist):** cada participante crea y edita su propia lista de deseos (título, notas como talla/color y enlace opcional).
- **Exclusiones personalizadas:** evita que ciertas personas se regalen entre sí (con opción **mutua**, ideal para parejas o familiares).
- **Mensajes privados automáticos por el bot:**
  - Al ejecutar el sorteo, el bot escribe por privado a cada participante indicando a quién le ha tocado regalar, el presupuesto máximo, la fecha de revelación y su lista de deseos.
  - **Avisos en tiempo real:** si tu amigo invisible añade, edita o borra regalos después del sorteo, el bot te avisa automáticamente por privado.
  - **Recordatorios y re-sorteo:** envía recordatorios a quien aún no haya rellenado su lista y permite volver a sortear si hace falta.
- **Seguridad y privacidad:**
  - Validación criptográfica `HMAC-SHA256` de `initData` de Telegram WebApp mediante Web Crypto API.
  - Cada participante solo puede consultar su propia asignación (`myTarget`) una vez realizado el sorteo.
  - Interfaz adaptada automáticamente al tema claro u oscuro de Telegram.

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
│   └── 0001_init.sql          # Esquema SQLite para Cloudflare D1
├── src/
│   ├── shared/
│   │   ├── types.ts           # Tipos compartidos entre Worker y Mini App
│   │   └── draw.ts            # Algoritmo de sorteo con backtracking (MRV) y exclusiones
│   ├── worker/
│   │   ├── index.ts           # Entrada del Cloudflare Worker (API + Webhook + Assets)
│   │   ├── auth.ts            # Validación HMAC-SHA256 de Telegram initData
│   │   ├── bot.ts             # Manejador del webhook (/start, /misorteos, deep links)
│   │   ├── db.ts              # Consultas D1 y lógica de salas/notificaciones
│   │   ├── routes.ts          # API REST (/api/rooms, wishlist, exclusions, draw, remind)
│   │   └── telegram.ts        # Cliente ligero de Telegram Bot API
│   └── web/
│       ├── index.html         # Mini App HTML con soporte light/dark y SDK de Telegram
│       ├── styles.css         # Estilos adaptados a Telegram ThemeParams
│       ├── main.ts            # Arranque, enrutado y BackButton de Telegram
│       ├── api.ts             # Cliente HTTP tipado
│       ├── telegram-sdk.ts    # Envoltorio de Telegram.WebApp + modo demo local
│       ├── validation.ts      # Validación accesible de formularios
│       ├── dialog.ts          # Modales nativos <dialog> con light-dismiss
│       └── views/             # Vistas de inicio y detalle de sala
└── test/
    ├── auth.test.ts           # Tests de verificación criptográfica de initData
    └── draw.test.ts           # Tests del algoritmo de sorteo y exclusiones
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
