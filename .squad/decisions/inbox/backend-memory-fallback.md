### 2026-09-04: Generated-tool file-store fallback now degrades to in-memory on read-only hosts
**By:** Backend
**What:** When Supabase is not configured and the local filesystem is read-only (as on the current Porter container at `/app`), generated-tool storage now falls back from `.data/tools` files to process-memory instead of crashing the request.
**Why:** Live production generation was succeeding far enough to hit storage, but the file-backed fallback could not `mkdir /app/.data`. In-memory fallback preserves the stateless current-product posture and keeps real customer generations working until a durable store is configured in production.
