# ZII-005: Collections and Saved Requests

**Branch:** `feature/collections`
**Priority:** Medium
**Estimate:** Large

## Summary

Add Postman-style collections so users can save, organize, and quickly replay requests. A collection is a named folder containing saved requests (method, URL, headers, params, body). Users can click a saved request to load it into the builder and re-send it.

## Current State

- Request history shows recent requests (chronological, single flat list)
- History is transient — items can be cleared; no organization or naming
- No way to save a "template" or favorite request for reuse

## Acceptance Criteria (checklist)

- [ ] Add a "Collections" or "Saved" section (sidebar, accordion, or tab alongside History)
- [ ] Users can create named collections (e.g. "Auth API", "User Service")
- [ ] Users can save the current request into a collection with an optional name
- [ ] Saved request stores: method, URL, headers, params, body, auth (Bearrer/Basic)
- [ ] Clicking a saved request loads it into the builder (does not auto-send)
- [ ] Support nested folders within collections (optional, can be v2)
- [ ] Persist collections to `localStorage`
- [ ] Allow edit/delete of collections and saved requests
- [ ] ZII can reference collection/request names in context when helping user

## Technical Notes

- Storage key: `ziip-collections` (JSON: `{ id, name, requests: [{ id, name, method, url, headers, params, body }] }`)
- Different from history: collections are user-curated; history is chronological log
- Consider drag-and-drop reordering for later
- UI: collapsible collection list in a sidebar or dropdown, similar to Postman's left panel

## Dependencies

- None

## Out of Scope

- Import Postman/OpenAPI collections (separate ticket)
- Sharing or syncing collections
- Pre-request scripts or tests
