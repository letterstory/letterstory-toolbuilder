# Logo Fidelity Verification

Date: 2026-09-05  
Production base URL: `https://web-22301-57c6c7ab-4p0z458q.onporter.run`

Fresh production smoke coverage was re-run for the two previously broken domains (`airbnb.com`, `mailchimp.com`) plus three new brands (`spotify.com`, `doordash.com`, `figma.com`). All five domains eventually generated successfully, every `/t/[id]` route returned `200 text/html`, and the shared iframe resize markers were present in the served HTML. Screenshots were captured with Playwright from the live `/t/{id}` pages.

## Results

| Domain | Tool ID | Generate | `/t/[id]` iframe contract | Logo present | Font fidelity notes | Screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| airbnb.com | `b631005a-185b-4945-b8f4-3e36da260090` | Pass after 3 attempts (two request-budget retries) | Pass (`200`, `text/html`, resize markers present) | **Pass — real logo image.** Rendered header used an inline Airbnb logo `<img>` data URI, not a placeholder icon. | **Mostly on-brand.** Body + heading fonts resolved to `Airbnb Cereal VF`/`Circular`; advisory only warned that body text used `#222` instead of the expected `#6C6C6C`. | [airbnb-com.png](./screenshots/logo-fidelity-verification/airbnb-com.png) |
| mailchimp.com | `c2acd7f9-e317-4a06-8eb3-d2cffb5c325a` | Pass | Pass (`200`, `text/html`, resize markers present) | **Fail — generic invented icon.** Header used a circular badge with a generic envelope SVG instead of Mailchimp's real wordmark/mascot logo. | **Good typography.** Body font resolved to `Graphik Web`; heading font resolved to `Means Web` with Georgia fallback only as backup. | [mailchimp-com.png](./screenshots/logo-fidelity-verification/mailchimp-com.png) |
| spotify.com | `2992d8e0-2fca-4aa5-827b-ceea56d881c5` | Pass | Pass (`200`, `text/html`, resize markers present) | **Pass — real/recreated Spotify mark.** Header used the recognizable Spotify circular glyph, not a generic music icon. | **Good typography.** Body + heading fonts resolved to `SpotifyMixUI` / `SpotifyMixUITitle`. | [spotify-com.png](./screenshots/logo-fidelity-verification/spotify-com.png) |
| doordash.com | `c1cdac32-8025-41a2-b905-beca31498daf` | Pass | Pass (`200`, `text/html`, resize markers present) | **Fail — generic invented badge.** Header rendered a white circle with a serif `D`, not DoorDash's real logo/wordmark. | **Poor typography.** Main body fell back to `Times New Roman`; this does not match DoorDash's `DD Norms` / `TT Norms` family. | [doordash-com.png](./screenshots/logo-fidelity-verification/doordash-com.png) |
| figma.com | `7b967bc4-c58c-4fe1-97a2-466361a561ab` | Pass after 2 attempts (one request-budget retry) | Pass (`200`, `text/html`, resize markers present) | **Pass — real logo image.** Rendered header used an inline Figma logo `<img>` data URI. | **Good typography.** Body + heading fonts resolved to `figmaSans` with Inter fallback. | [figma-com.png](./screenshots/logo-fidelity-verification/figma-com.png) |

## Verdict

- **Pipeline health:** 5/5 domains passed generation plus the `/t/[id]` iframe contract.
- **Logo fidelity:** mixed. Airbnb, Spotify, and Figma showed real/recognizable brand logos; Mailchimp and DoorDash still rendered generic/invented header marks instead of real brand logos.
- **Font fidelity:** strong for Airbnb, Mailchimp, Spotify, and Figma; **DoorDash regressed badly** to `Times New Roman`.
- **Important finding:** the current backend brand-fidelity advisory still missed at least two real logo-fidelity failures (`mailchimp.com`, `doordash.com`), both of which reported advisory `pass` even though the rendered header branding was generic.
