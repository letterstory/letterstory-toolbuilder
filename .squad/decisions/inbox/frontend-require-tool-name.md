### 2026-09-05: Require a real tool name before generation
**By:** Frontend
**What:** The tool builder UI and generation surface now reject empty or whitespace-only `projectName` values with a destructive inline/client error and a matching server-side 400 response instead of letting the request fall through to the deep `"Untitled tool"` fallback.
**Why:** Users were able to submit blank tool names and silently create "Untitled tool" outputs. Requiring the field at the form and API boundary preserves the defensive fallback deeper in orchestration while stopping the broken user-facing path in practice.
