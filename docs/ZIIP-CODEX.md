# ZIIP Codex — Project Brain for AI Agents

> Canonical reference for ZIIP's design, architecture, coding conventions, and patterns.
> Use this document when building skills, writing code, or reasoning about the project.

---

## 1. What Is ZIIP

ZIIP is a native desktop API client with an integrated AI assistant called **ZII**. Think Postman meets an AI copilot — users send HTTP requests, inspect responses, and ask ZII for help debugging, crafting requests, or generating mock data.

- **Product name:** ZIIP
- **AI assistant name:** ZII
- **Identifier:** `com.ziiwong.ziip`
- **Version:** 0.1.0-alpha

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Desktop shell | Tauri | 2 |
| Frontend | React | 19 |
| Language (FE) | TypeScript | 5.8 |
| Bundler | Vite | 7 |
| Styling | Tailwind CSS | 4 |
| Animation | Framer Motion | 12 |
| Icons | Lucide React | latest |
| Backend | Rust | stable |
| HTTP client (BE) | reqwest | 0.11 (rustls-tls) |
| Serialization | serde / serde_json | 1 |

---

## 3. Project Structure

```
ZIIP/
├── src/                          # React frontend
│   ├── main.tsx                  # ReactDOM entry
│   ├── App.tsx                   # Root component (monolith)
│   ├── App.css                   # Global styles + Tailwind import
│   ├── vite-env.d.ts             # Vite type declarations
│   ├── lib/
│   │   └── utils.ts              # cn() — clsx + tailwind-merge
│   └── components/
│       └── ui/
│           ├── ai-voice-input.tsx
│           ├── text-effect.tsx
│           └── demo.tsx
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json
│   └── src/
│       ├── main.rs               # Entry — calls ziip_lib::run()
│       └── lib.rs                # All commands, types, AI logic
├── public/
│   └── logo.svg
├── docs/
│   ├── ZIIP-CODEX.md             # This file
│   └── tickets/
│       ├── ZII-001-ai-backend-integration.md
│       └── ZII-002-request-context.md
├── index.html                    # Vite HTML entry
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── README.md
```

---

## 4. Architecture

### 4.1 Data Flow

```
┌──────────────────────────────────┐
│        React Frontend            │
│  App.tsx (monolith component)    │
│                                  │
│  invoke("make_request", {...})   │──► Tauri IPC ──► lib.rs::make_request()
│  invoke("chat", {...})           │──► Tauri IPC ──► lib.rs::chat()
│                                  │
│  useState + localStorage         │
└──────────────────────────────────┘
```

- **Frontend → Backend:** `invoke()` from `@tauri-apps/api/core`.
- **Backend → External:** `reqwest::Client` HTTP calls (user APIs or AI providers).
- **No backend state:** Every call is stateless; config and keys come from the frontend.
- **No database:** Persistence is `localStorage` only.

### 4.2 Tauri Commands (IPC Contract)

| Command | Params | Returns |
|---------|--------|---------|
| `make_request` | `method: String`, `url: String`, `body: String`, `headers: HashMap<String, String>` | `Result<HttpResponse, HttpError>` |
| `chat` | `message: String`, `provider: Option<String>`, `api_key: Option<String>`, `context: Option<RequestContext>` | `Result<String, HttpError>` |

**`HttpResponse`:**
```rust
struct HttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
    time_ms: u64,
}
```

**`HttpError`:**
```rust
struct HttpError {
    message: String,
}
```

### 4.3 AI Integration

- **Providers:** Gemini (default, `gemini-2.0-flash`) and OpenAI (`gpt-4o-mini`).
- **API key resolution:** Frontend-passed key → env var (`GEMINI_API_KEY` / `OPENAI_API_KEY`) → error.
- **System prompt:** ZII is an API-focused assistant; concise, practical, context-aware.
- **Request context (ZII-002):** URL, method, params, headers, body, and last response are injected into the chat message. Response bodies are truncated at 4000 chars.

---

## 5. Frontend Patterns

### 5.1 Component Architecture

- **Monolith root:** `App.tsx` (~1300 lines) contains all state, handlers, and UI.
- **Utility components:** `components/ui/` holds reusable UI pieces (`TextEffect`, `AIVoiceInput`).
- **Render helpers:** Functions like `renderKeyValueEditor(items, setItems)` live inside `App.tsx` instead of being extracted as components.
- **No routing:** Single-page, single-view application.

### 5.2 State Management

- **Local state only:** 30+ `useState` calls in `App.tsx`; no Redux, Zustand, or Context.
- **Persistence:** `localStorage` for request history, LLM provider, and API keys.
- **Key storage keys:**
  - `ziip-request-history`
  - `ziip-llm-provider`
  - `ziip-gemini-api-key`
  - `ziip-openai-api-key`

### 5.3 Types

Types are defined inline in the file that uses them. No shared `types/` module.

```typescript
type KeyValuePair = { id: string; key: string; value: string; enabled: boolean };
type ChatMessage = { id: string; role: "user" | "assistant"; text: string };
type RequestHistoryEntry = { id: string; method: string; url: string; timestamp: number; status?: number; time_ms?: number };
type LLMProviderId = (typeof LLM_PROVIDERS)[number]["id"];
```

### 5.4 Tauri Invoke Usage

```typescript
import { invoke } from "@tauri-apps/api/core";

// Typed return
const reply = await invoke<string>("chat", { message, provider, apiKey, context });

// Untyped return (uses `any`)
const res: any = await invoke("make_request", { method, url, body, headers });
```

### 5.5 Styling

- **Tailwind CSS 4** via `@tailwindcss/vite` plugin — no separate `tailwind.config` or `postcss.config`.
- **`cn()` utility** (`lib/utils.ts`) for merging Tailwind classes: `clsx` + `tailwind-merge`.
- **Design palette:** `slate` (neutrals), `emerald` (success/primary), `rose` (delete/error), `amber` (warnings), `violet`/`sky` (accents).
- **Global styles** in `App.css`: Inter font, antialiasing, minimal resets, then `@import "tailwindcss"`.

### 5.6 Animation

- **Framer Motion** throughout: `motion.div`, `AnimatePresence`, `whileHover`, `whileTap`.
- Entry/exit animations on modals, dropdowns, list items, and buttons.
- `TextEffect` component for per-character/word/line text animations.

### 5.7 Icons

- **Lucide React** for all icons: `Send`, `History`, `Settings`, `Trash2`, `Copy`, `Plus`, `FileInput`, `ChevronDown`, `Mic`, `ArrowUp`, etc.

### 5.8 ID Generation

- `crypto.randomUUID()` for all runtime IDs (chat messages, history entries, key-value rows).

### 5.9 Path Aliases

- `@/` → `src/` (configured in both `vite.config.ts` and `tsconfig.json`).
- Usage: `@/components/ui/...`, `@/lib/utils`.

---

## 6. Backend Patterns (Rust)

### 6.1 Module Organization

Single-file backend (`lib.rs`). Layout:

1. Imports and constants
2. Gemini request/response types
3. OpenAI request/response types
4. Request context types + `build_context_block()`
5. `chat` command
6. `HttpResponse` / `HttpError` types
7. `make_request` command
8. `run()` — Tauri builder

### 6.2 Command Pattern

```rust
#[tauri::command]
async fn command_name(
    param: Type,
    optional_param: Option<Type>,
) -> Result<ReturnType, HttpError> {
    // ...
}
```

- All commands are `async`.
- Return `Result<T, HttpError>`.
- No `tauri::State`; stateless by design.
- Registered in `tauri::generate_handler![make_request, chat]`.

### 6.3 Error Handling

- Single error type: `HttpError { message: String }`.
- All error conversions are manual `map_err(|e| HttpError { message: ... })`.
- No `From` impls or `thiserror`.

### 6.4 HTTP Client

- `reqwest::Client::new()` per call (no shared/pooled client).
- TLS via `rustls-tls` feature.
- JSON requests via `.json(&body)`.

### 6.5 Serde Conventions

- `#[derive(Serialize)]` for outgoing types, `#[derive(Deserialize)]` for incoming.
- `#[serde(rename = "camelCase")]` for JSON field name mapping.
- `#[serde(default)]` on optional fields.
- `Option<T>` for nullable/optional fields.

---

## 7. Naming Conventions

### Frontend (TypeScript/React)

| Element | Convention | Examples |
|---------|------------|---------|
| Components | PascalCase | `App`, `TextEffect`, `AIVoiceInput` |
| Component files | kebab-case | `text-effect.tsx`, `ai-voice-input.tsx` |
| Utility files | camelCase | `utils.ts` |
| Functions/handlers | camelCase verb phrases | `sendChatMessage`, `makeRequest`, `copyResponse` |
| State variables | camelCase | `chatInput`, `requestHistory`, `settingsOpen` |
| Constants | UPPER_SNAKE_CASE | `HISTORY_STORAGE_KEY`, `LLM_PROVIDERS`, `HEADER_PRESETS` |
| Types | PascalCase | `KeyValuePair`, `ChatMessage`, `LLMProviderId` |

### Backend (Rust)

| Element | Convention | Examples |
|---------|------------|---------|
| Functions | snake_case | `make_request`, `build_context_block` |
| Structs | PascalCase | `HttpResponse`, `RequestContext` |
| Constants | SCREAMING_SNAKE_CASE | `GEMINI_API_URL`, `ZII_SYSTEM_PROMPT` |
| Fields | snake_case | `time_ms`, `last_response` |
| JSON keys | camelCase (via serde rename) | `lastResponse`, `timeMs` |
| Env vars | SCREAMING_SNAKE_CASE | `GEMINI_API_KEY`, `OPENAI_API_KEY` |
| Crate name | snake_case | `ziip` (package), `ziip_lib` (lib) |

---

## 8. Configuration

### Vite (`vite.config.ts`)

- Plugins: `@tailwindcss/vite`, `@vitejs/plugin-react`
- Path alias: `@` → `./src`
- Dev server: port 1420, strictPort
- HMR: uses `TAURI_DEV_HOST` env for WebSocket host
- Ignores `src-tauri` from file watching

### TypeScript (`tsconfig.json`)

- Target: ES2020
- Module: ESNext, resolution: `bundler`
- Strict mode enabled
- Path alias: `@/*` → `src/*`

### Tauri (`tauri.conf.json`)

- Product name: ZIIP
- Window: 1280×800 default, 960×640 minimum
- Dev URL: `http://localhost:1420`
- Build command: `npm run build`, output: `../dist`
- CSP: null (permissive for dev)
- Capabilities: `core:default`, `opener:default`

---

## 9. UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: Logo + "ZIIP"  │  History dropdown  │  Settings gear   │
├─────────────────────────┬───────────────────────────────────────┤
│                         │                                       │
│   API Client Panel      │        ZII Chat Panel                 │
│                         │                                       │
│   [Method ▼] [URL bar]  │   Chat message history                │
│   [Send]                │   (scrollable)                        │
│                         │                                       │
│   Tabs:                 │                                       │
│   Headers | Params |    │                                       │
│   Body | Auth           │                                       │
│                         │                                       │
│   ──────────────────    │                                       │
│                         │                                       │
│   Response Panel        │   ┌─────────────────────────────┐     │
│   Status | Time | Size  │   │  Chat input + Send button   │     │
│   Body (highlighted)    │   └─────────────────────────────┘     │
│                         │                                       │
└─────────────────────────┴───────────────────────────────────────┘
```

- **Responsive:** Chat panel hidden on small screens (`hidden md:flex`).
- **Layout:** `flex-col md:flex-row`.

---

## 10. Feature Flags & Current State

### Implemented

- Full HTTP client (GET, POST, PUT, DELETE, PATCH)
- Request builder: headers (with presets + bulk paste), query params, JSON body, auth (Bearer/Basic)
- Response viewer with syntax-highlighted JSON, status, timing
- ZII chat with Gemini and OpenAI backends
- Request context injection into ZII chat
- Request history with localStorage persistence
- Settings modal for LLM provider and API key configuration
- Copy response to clipboard
- Framer Motion animations throughout

### Planned / Open

- ZII-002 partial: Handle "no response yet" context state
- ZII-003 (referenced): Apply ZII suggestions back to request builder
- Streaming responses (v1 is request/response only)

---

## 11. Development Commands

```bash
npm install                 # Install frontend dependencies
npm run tauri dev           # Dev mode with hot reload
npm run tauri build         # Production build
npm run dev                 # Frontend-only dev server (port 1420)
npm run build               # Frontend-only build (tsc + vite)
```

---

## 12. Key Design Decisions

1. **Monolith `App.tsx`:** All state and UI in one file for rapid iteration. Component extraction is deferred.
2. **No global state library:** `useState` + `localStorage` is sufficient at current scale.
3. **Stateless backend:** No `tauri::State`, no database. Every command call is self-contained.
4. **Per-call HTTP client:** `reqwest::Client::new()` on every invocation. No connection pooling yet.
5. **Single-file Rust:** All backend logic in `lib.rs`. No module splitting yet.
6. **Tailwind 4 without config:** Uses Vite plugin; no `tailwind.config.js` or `postcss.config.js`.
7. **API key in localStorage:** Stored in browser storage, passed to backend per call. No backend secret store.
8. **Manual error mapping:** `HttpError { message }` with explicit `map_err` instead of `thiserror` or `From` impls.

---

## 13. Error Handling Patterns

### Frontend

```typescript
try {
  const reply = await invoke<string>("chat", { ... });
  // handle success
} catch (e) {
  const errMsg = typeof e === "object" && e !== null && "message" in e
    ? String((e as { message: unknown }).message)
    : "Sorry, something went wrong.";
  // show error in chat / response panel
}
```

- `invoke` errors are caught and surfaced in the UI (chat messages or response panel).
- `localStorage` parse failures silently return defaults.

### Backend

```rust
reqwest_call.await.map_err(|e| HttpError { message: e.to_string() })?;
```

- All external errors are converted to `HttpError { message }`.
- No panics in command handlers.

---

## 14. Ticket Format

Tickets live in `docs/tickets/` as Markdown files named `ZII-NNN-slug.md`.

Structure:
```markdown
# ZII-NNN: Title

**Branch:** `feature/...`
**Priority:** High | Medium | Low
**Estimate:** Small | Medium | Large

## Summary
## Current State
## Acceptance Criteria (checklist)
## Technical Notes
## Dependencies
## Out of Scope (optional)
```

---

## 15. Glossary

| Term | Meaning |
|------|---------|
| **ZIIP** | The application — a desktop API client |
| **ZII** | The AI assistant embedded in ZIIP |
| **Request context** | Current URL, method, headers, params, body, and last response passed to ZII |
| **Tauri command** | A Rust function exposed to the frontend via `#[tauri::command]` and `invoke()` |
| **Provider** | An AI backend — currently Gemini or OpenAI |
