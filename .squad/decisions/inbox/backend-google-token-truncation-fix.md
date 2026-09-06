### 2026-09-06: Increase HTML token headroom and strengthen truncated-document retries

**By:** Backend
**What:** Raised the primary HTML-generation output cap from 8k to 12k tokens, give invalid-HTML retries a 16k token cap plus a compactness/completion instruction, and widened the initial retry timeout budget from 35s to 50s while keeping the pipeline under the 280s app budget.
**Why:** Google's brand context plus verbose creative prompts could exhaust the old 8k output ceiling before `</html>`, and the follow-up retry had too little remaining time to recover. The higher cap plus truncation-specific retry makes full-document completion materially more reliable without touching unrelated sandbox work.
