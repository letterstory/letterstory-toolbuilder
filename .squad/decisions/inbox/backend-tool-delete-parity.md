### 2026-09-06: Generated tool deletion uses the shared surface contract across REST/MCP/CLI
**By:** Backend
**What:** Added `deleteGeneratedTool(id): Promise<boolean>` to the shared store contract, implemented it in both file and Supabase backends, exposed it through `deleteGeneratedToolSurface({ id })`, and wired that surface into `DELETE /api/tools/[id]`, MCP `delete_generated_tool`, and CLI `toolbuilder tools delete <id>`.
**Why:** Generated tools had no removal path, so dashboard/recent-tools entries accumulated forever. Using the shared surfaces layer preserves REST/MCP/CLI parity and keeps not-found/success behavior consistent.

Contract settled for Frontend:
- Request: `DELETE /api/tools/{id}` with the tool id in the path; no request body.
- Success response: HTTP `200` with `{ "status": "success", "id": "<tool-id>" }`.
- Not-found response: HTTP `404` with `{ "status": "error", "message": "Tool not found." }`.
- MCP mirrors the same body via `delete_generated_tool` input `{ id: string }`.
