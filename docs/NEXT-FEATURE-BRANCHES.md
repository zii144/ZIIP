# Suggested Feature Branches — Next Implementation

**Merged to main:** `feature/environment-variables` (includes ZII-005 Collections, ZII-004 Environments)

---

## 1. `feature/zii-apply-suggestions` (ZII-003)

**Priority:** High | **Estimate:** Medium

Let ZII’s suggestions update the request builder directly instead of copying manually.

**Scope:**
- Detect when ZII suggests URLs, headers, params, or body changes
- Add “Apply” or “Use this” controls on suggested snippets
- Map suggestions into the builder (method, URL, headers, params, body)
- Support partial updates (e.g. only body, only headers)

**Reference:** ZIIP-CODEX §10 Planned/Open

---

## 2. `feature/unresolved-var-warning` (ZII-004 completion)

**Priority:** Medium | **Estimate:** Small

Show a warning before send when environment variables are unresolved.

**Scope:**
- Compute unresolved variables from current builder state (before send)
- Show a banner near the Send button: “Unresolved: baseUrl, token. Add them in Settings → Environments.”
- Optionally highlight unresolved `{{vars}}` differently (e.g. amber/warning vs resolved violet)

**Reference:** ZII-004 acceptance criterion #8

---

## 3. `feature/import-collections` (Postman/OpenAPI import)

**Priority:** Medium | **Estimate:** Large

Import Postman collections or OpenAPI specs to create collections.

**Scope:**
- Parse Postman collection v2.1 JSON
- Parse OpenAPI 3.0 JSON
- Map to ZIIP collections and saved requests
- Add “Import” in Collections dropdown or Settings
- Support file picker for `.json` import

**Reference:** ZII-005 Out of Scope

---

## Alternatives to Consider

| Branch | Description | Effort |
|--------|-------------|--------|
| `feature/streaming-chat` | Stream ZII responses character-by-character | Medium |
| `feature/nested-collections` | Nested folders within collections (ZII-005 v2) | Medium |
| `feature/zii-no-response-context` | Improve ZII-002 “no response yet” context handling | Small |
