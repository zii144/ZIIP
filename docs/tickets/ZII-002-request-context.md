# ZII-002: Request Context for ZII Assistant

**Branch:** `feature/zii-assistant`  
**Type:** Feature  
**Priority:** High  

## Summary

Give ZII Assistant access to the current request state (URL, method, headers, params, body) and the last response so it can provide contextual, relevant advice instead of generic responses.

## Current State

- ZII receives only the user's chat message.
- No visibility into what endpoint the user is testing, what headers are set, or what the last response was.
- Assistant cannot answer questions like “Why did this return 401?” or “What headers should I add for JSON?”

## Acceptance Criteria

- [x] ZII receives request context with each message:
  - Current URL and HTTP method
  - Query params (if any)
  - Request headers
  - Request body
  - Last response (status, headers, body) when available
- [x] Context is passed to the backend (Tauri command or API) in a structured format.
- [ ] When no request has been sent yet, context includes “no response yet” or equivalent.
- [x] System prompt instructs ZII to use context when relevant (e.g., debugging 401, suggesting headers).
- [x] Chat UI behavior unchanged; changes are backend/context only.

## Technical Notes

- Extend `invoke("chat", ...)` payload to include a `context` object.
- Consider truncating large response bodies to avoid token limits.
- Optional: Add a “Refresh context” or “Include latest response” control for long chats.

## Dependencies

- ZII-001 (AI Backend Integration) must be done first; context is passed into the existing chat flow.

## Out of Scope

- Applying ZII suggestions back to the request builder (see ZII-003).
- Editing or mutating request state from ZII.
