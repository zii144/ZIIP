# ZII-004: Environment Variables

**Branch:** `feature/environment-variables`
**Priority:** Medium
**Estimate:** Medium

## Summary

Add Postman-style environment variables so users can define reusable values (e.g. `{{baseUrl}}`, `{{token}}`) and substitute them in the request URL, headers, params, and body. Supports multiple named environments (e.g. Development, Staging, Production).

## Current State

- URL, headers, params, and body are plain text only
- No variable substitution
- Users must manually update values when switching contexts (dev vs prod)

## Acceptance Criteria (checklist)

- [ ] Add an "Environments" section in settings (or a dedicated Environments panel)
- [ ] Support multiple named environments (e.g. Development, Production)
- [ ] Variables are key-value pairs: `baseUrl` → `https://api.dev.example.com`
- [ ] Syntax: `{{variableName}}` for substitution
- [ ] Substitution applies to: URL, query params, headers, body (JSON and raw)
- [ ] Allow selecting the active environment (dropdown in header or settings)
- [ ] Persist environments and variables to `localStorage`
- [ ] Clear UX when a variable is unresolved (show warning or placeholder)
- [ ] ZII chat receives resolved values in request context (not raw `{{var}}`)

## Technical Notes

- Parse URL/body/params/headers for `{{...}}` patterns before sending to `make_request`
- Backend can stay unchanged; resolution happens in frontend before `invoke`
- Consider: nested variables (`{{apiHost}}/v1`), default values (`{{port:8080}}`) for future iterations
- Storage key: `ziip-environments` (JSON array of `{ id, name, variables: { key: value } }`)

## Dependencies

- None

## Out of Scope

- Import/export of Postman environment files (separate ticket)
- Scripts or dynamic variable evaluation
- Team/shared environments
