# Pull Request: Merge feature/zii-assistant into main

## Title
`feat: ZII Assistant settings modal for LLM provider and API key configuration`

## Summary

This PR merges the **feature/zii-assistant** branch into `main`, adding a settings modal that lets users configure their AI assistant (ZII) — choose the LLM provider (Gemini or OpenAI) and manage API keys for each provider.

## What's Included

- **Settings modal** — Accessible via the gear icon in the header; allows switching between Gemini and OpenAI
- **API key management** — Per-provider API key input with secure storage in `localStorage`
- **Provider selection** — Dropdown to select Gemini (Google) or OpenAI (GPT) with hints for key format
- **Persistent configuration** — LLM provider and API keys are persisted across sessions

## Technical Notes

- Uses existing `localStorage` keys: `ziip-llm-provider`, `ziip-gemini-api-key`, `ziip-openai-api-key`
- Backend `chat` command already accepts `provider` and `api_key`; frontend now passes user-selected values
- UI follows existing design patterns (Tailwind, Framer Motion, Lucide icons)

## Related Branches

- Builds on `feature/request-history` (request history is already in main)
- Single commit ahead of main: `5fd5787 feat(App): add settings modal for LLM provider and API key management`

## Checklist

- [x] Settings modal opens and closes correctly
- [x] Provider selection persists
- [x] API keys persist and are passed to `chat` command
- [x] No breaking changes to existing behavior

---

**Target:** `main`  
**Source:** `feature/zii-assistant`  
**Merge:** Squash or merge — maintainer's choice
