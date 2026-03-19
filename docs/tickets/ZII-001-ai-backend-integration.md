# ZII-001: AI Backend Integration

**Branch:** `feature/zii-assistant`  
**Priority:** High  
**Estimate:** Medium

---

## Summary

Replace the ZII Assistant stub with real AI integration. The assistant should process user messages and return intelligent, relevant responses instead of echoing input.

---

## Current State

- `sendChatMessage()` uses a 600ms delay stub and echoes the user message
- No Tauri command for chat
- No LLM/API integration

---

## Acceptance Criteria

- [x] Add a `chat` Tauri command in `src-tauri/src/lib.rs` that accepts a message and returns an AI response
- [x] Integrate with an AI provider (OpenAI API, local LLM, or configurable backend)
- [x] Handle API key securely (e.g., user-provided via Settings, stored in Tauri store)
- [x] Replace stub in `sendChatMessage()` with `invoke("chat", { message: text })`
- [x] Preserve error handling: show "Sorry, something went wrong." on failure
- [x] Maintain loading state and streaming UX (simple request/response for v1)

---

## Technical Notes

- Use `reqwest` in Rust for HTTP calls (already a dependency)
- Consider `tauri-plugin-store` for persisting API key
- OpenAI chat completions API: `POST https://api.openai.com/v1/chat/completions`
- Optional: Support system prompt for API-client context

---

## Dependencies

- None (first ticket in branch)
