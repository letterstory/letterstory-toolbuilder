### 2026-09-06: Workspace transient feedback now also uses Sonner toasts
**By:** Frontend
**What:** I installed `sonner`, scaffolded the shadcn `src/components/ui/sonner.tsx` primitive, mounted a single `<Toaster />` in `src/app/layout.tsx`, and added toast notifications alongside the existing inline `StatusChip` messaging in `tool-builder-workspace.tsx`.
**Why:** Users could miss inline success/error feedback when the chat panel was scrolled out of view. Floating toasts provide an always-visible transient confirmation layer without removing the persistent contextual status panel.

Events that now trigger toasts:
- tool generation success
- tool generation failure
- tool update success
- tool update failure
- brand/theme apply success (via the shared tool update flow)
- brand/theme apply failure (via the shared tool update flow)
- rollback success
- rollback failure
- recent tool delete success
- recent tool delete failure
