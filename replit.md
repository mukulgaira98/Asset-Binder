# AI Arduino IDE

An AI-powered Arduino IDE web app with Monaco Editor, AI code generation/fixing/explaining via OpenAI, project management, simulated compilation, and an AI chat assistant panel.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/arduino-ide run dev` — run the frontend (Vite, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit AI OpenAI proxy

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + Monaco Editor + Tailwind CSS
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- AI: OpenAI via Replit AI Integrations proxy (model: gpt-5.4)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/arduino-ide/` — React/Vite frontend IDE
- `artifacts/api-server/` — Express 5 API server
- `lib/api-spec/openapi.yaml` — source-of-truth OpenAPI spec
- `lib/api-zod/` — Zod validation schemas (generated from OpenAPI)
- `lib/api-client-react/` — React Query hooks (generated from OpenAPI)
- `lib/db/src/schema/` — Drizzle ORM schema (projects, conversations, messages)
- `lib/integrations-openai-ai-server/` — OpenAI client for server-side use

## Architecture decisions

- **Contract-first API**: OpenAPI spec drives all validation and client hook generation via Orval. Never edit generated files.
- **SSE streaming**: AI endpoints stream responses as Server-Sent Events for real-time token delivery in the UI.
- **Simulated compiler**: `/compile` endpoint validates `void setup()` / `void loop()` presence and returns realistic output — no real Arduino CLI.
- **Model**: Uses `gpt-5.4` via Replit AI Integrations proxy. No user-facing API key needed.
- **OpenAPI naming**: Entity-shaped schema names (e.g. `OpenaiConversationInput`) avoid Orval TS2308 collisions — do not change `info.title` or entity names.

## Product

- **Project Explorer** — Create, rename, and switch between Arduino sketch projects
- **Monaco Code Editor** — Full syntax highlighting and IntelliSense for C/C++
- **AI Generate** — Describe what you want; AI streams complete Arduino code into the editor
- **AI Fix** — One-click fix for compiler errors using AI
- **Compile** — Simulated compiler checks for required setup/loop functions
- **AI Assistant Panel** — Persistent chat with an Arduino expert AI, per-conversation history
- **Board Selector** — Switch between Uno, Nano, Mega 2560 targets

## User preferences

- VS Code-style dark IDE aesthetic with electric teal accents
- Monaco editor for all code editing

## Gotchas

- Do not run `pnpm dev` at workspace root — use workflow restart instead
- After editing the OpenAPI spec, always run codegen: `pnpm --filter @workspace/api-spec run codegen`
- Express 5 async route handlers: use `if (!parsed.success) { res.status(400).json(..); return; }` pattern (two lines), not `return res.status(400).json(...)` — TS7030 fires on the latter.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
