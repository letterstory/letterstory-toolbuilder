### 2026-09-05: Second brand fidelity sweep confirms contrast fix is not deployed in sampled dark exact-logo headers
**By:** Tester
**What:** I re-ran production `/api/tools/generate` across 15 new/supplemental brands and saved evidence under `artifacts/brand-fidelity-sweep-2/`. Logo fidelity passed 15/15, font fidelity passed 14/15, color fidelity passed 15/15, and contrast passed 10/15. Exact-logo light-protection behind `.ls-brand-lockup__logo` appeared on 5/8 exact-asset outputs.
**Why:** This sweep was specifically meant to validate the newer font-classification behavior on a fresh brand set and determine whether the in-flight dark-logo/dark-header protection had reached production. The saved snippets are literal HTML/CSS evidence, not visual guesswork.

**Ranked remaining bugs:**
1. Text-only wordmarks can disappear because the enforced wordmark color matches the header background. Representative evidence: coinbase.com → FAIL — text-only wordmark contrast ratio 1.00 on header bg #0554FB; google.com → FAIL — text-only wordmark contrast ratio 1.00 on header bg #ED943B; headspace.com → FAIL — text-only wordmark contrast ratio 1.00 on header bg #0061EF; marriott.com → FAIL — text-only wordmark contrast ratio 1.00 on header bg #FF8D6B
2. Exact-logo contrast protection is still absent on dark headers. Representative evidence: paypal.com → FAIL — exact logo sits directly on dark header bg #042B93 with no light protective container
3. Font fidelity still fails on 1 of 15 brands. Representative evidence: robinhood.com → FAIL — expected body=sans/heading=serif; got body=sans/heading=sans
