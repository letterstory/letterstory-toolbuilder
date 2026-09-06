### 2026-09-06: Per-message chat actions reuse the existing rollback path
**By:** Frontend
**What:** Added `resultVersion`, per-message telemetry, and disclosure summaries to `BuilderConversationMessage`, populated them on successful generate/update replies, and wired chat-level Revert buttons to the existing `handleRollback(version)` flow already used by the topbar/dashboard history UI.
**Why:** Each assistant reply now knows which tool version it produced and how long that real run took, so the chat can truthfully show Base44-style “Wrote/Edited…” plus “Thought for Ns” disclosures and safely revert a single message’s output without introducing a second rollback implementation.
