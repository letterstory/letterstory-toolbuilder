### 2026-09-06: Rollback now restores the selected version number directly
**By:** Backend
**What:** I replaced both generated-tool backends' `rollbackGeneratedTool()` implementations with dedicated restore writes that set the live record's `version` to the selected historical version, prepend an auto-backup snapshot of the pre-restore state, and remove the restored entry from history instead of routing rollback through `updateGeneratedTool()`.
**Why:** The generic update path always increments `version` and archives the current record, which made restore behave like a new forward edit (`v7` restoring `v2` became customer-visible `v8`). The dedicated rollback path now matches the intended Base44-style restore behavior while still preserving the replaced state as recoverable history.
