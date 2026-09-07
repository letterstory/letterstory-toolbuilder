### 2026-09-06: Add dashboard brand logo subsection
**By:** Frontend
**What:** Added a Logo subsection to the dashboard Brand snapshot card so ingested `brandSnapshot.logoDataUri` is shown alongside Colors and Fonts, with an exact-asset badge when applicable and a matching empty state when no logo exists.
**Why:** The dashboard was omitting an ingested brand asset that is already stored and used elsewhere, so this makes the brand snapshot reflect the full captured branding state without changing edit flows.
