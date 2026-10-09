# Design QA — MoneyFlow Google sign-in assistance

Date: 2026-10-09
Scope: MoneyFlow /login Google provider and expanding help UI.
Status: implemented locally on the user's Mac. No database, OAuth credentials, or money records changed.

## Source / implementation / comparison

User feedback: the original small green "มีปัญหาในการเข้าสู่ระบบ Google? ดูวิธีแก้" help link was not acceptable; the goal is a redesign for readability and usability, not pixel-perfect reproduction.

- Source visual truth, pre-redesign: .ux-audit/20261009/google-help-review/03-help-expanded-mobile390.png and 02-help-expanded-desktop.png
- Final implementation: .ux-audit/20261009/google-help-review/after/google-help-open-390.png and google-help-open-1440.png
- Combined before/after comparison: .ux-audit/20261009/google-help-review/comparison-mobile390.png and comparison-desktop1440.png. Before is left; after is right.
- Additional visual details: after/google-closed-390.png, after/google-closed-320.png, after/google-help-open-320.png, after/google-help-admin-390.png, after/google-help-admin-320.png

## Viewport and density

- Emulated CSS viewports: 320, 360, 390, 430, 760, 768, 1440 px; deviceScaleFactor=1, DPR=1.
- Mobile before image: 390x900 px; final image: 375x1421 px (390px viewport, effective 375px client area with vertical scrollbar). Two images normalized to 390px columns and cropped to first 900px for the comparison.
- Desktop before image: 1440x900 px; final image: 1425x1401 px (1440px viewport, 15px scrollbar). Two images normalized to 720px columns and cropped to 490px for the comparison.
- States compared: Google login tab, help expanded, developer guidance collapsed, and separately developer guidance expanded.

## Comparison history and resolved problems

P1 — Mobile content overflow
- Source: Browser width 390px, document width 458px. The Google and LINE tabs were clipped and the page had horizontal scrolling.
- Fix: CSS Grid minmax(0,1fr) for narrow viewport and min-width:0 on grid descendants, plus responsive button sizing.
- After: 390px emulator has scrollWidth=clientWidth=375px; 320px emulator both 305px; all seven tested widths passed.

P2 — Poor help affordance
- Source: Tiny single-line 11px link, low contrast, and long developer-oriented text on first expansion.
- Fix: Clear help row with 39px icon, heading, helper subtitle, animated disclosure chevron, and 66px tap area.
- After: Screenshot after/google-closed-390.png shows the unexpanded row; after/google-help-open-390.png shows an easy-to-follow accordion.

P2 — Developer instructions mixed with end-user advice
- Source: Origins and copyable OAuth technical values shown directly to end users.
- Fix: Three short numbered end-user steps; advanced Google Cloud configuration behind a separate disclosure, contextual localhost link on local IP.
- After: Open and advanced screenshots show distinct guidance levels.

P2 — Weak spacing, typography and controls
- Source: Dense helper copy, inconsistent tap sizes and hierarchy.
- Fix: Larger titles and icons, 12–14px informational text, minimum 44px copy actions, structured spacing, accessible focus states.
- After: Mobile and desktop comparisons show improved hierarchy and balanced card layouts.

## Required fidelity surfaces

- Fonts/typography: Existing brand fonts preserved. Stronger Thai headings and readable informational text; comfortable line-height; no clipped labels on narrow screens.
- Spacing/layout: Two desktop columns collapse to one on mobile. Responsive internal grid uses minmax(0,1fr), no horizontal overflow at seven tested widths. Help and nested details align.
- Colors/tokens: Preserves MoneyFlow emerald/sage/white palette; clearer contrasts for prominent interactive and explanatory content.
- Images/brand: Existing MoneyFlow brand mark and official Google Identity Services button remain. No replacement or approximated illustration was used.
- Copy/content: User-friendly three-step troubleshooting, optional email/LINE alternative, advanced OAuth docs separated, local-dev shortcut added.

## Interactions, tests and remaining verification

- Google provider, Email provider and LINE provider selectable, with aria-pressed states.
- Google Identity SDK loaded and its official rendered button visible in the browser screenshots.
- Help disclosures open and close, advanced copy buttons fit mobile width, native disclosure is keyboard-focusable.
- Browser UI QA passed at 320, 360, 390, 430, 760, 768, and 1440 px: no horizontal overflow.
- No browser runtime exceptions or console errors.
- Production build (TypeScript + Vite): passed.
- Bun unit tests: 31 pass, 0 fail.
- Actual external Google authentication callback was not executed; a real Google account/consent interaction and Google Cloud authorized origins must be checked separately when necessary.
- P3 follow-up: optional VoiceOver screen-reader check and external Google credential sign-in smoke test.

No unresolved P0, P1, or P2 findings in the scoped implementation.

final result: passed
