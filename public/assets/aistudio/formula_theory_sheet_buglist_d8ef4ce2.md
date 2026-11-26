# Formula Theory Sheet — Comprehensive Buglist

**Site Audited:** [https://formula-theory-sheet.vercel.app/](https://formula-theory-sheet.vercel.app/)  
**Audit Date:** November 26, 2026 (2 QA Passes)  
**Total Issues Found:** 32 (8 High, 15 Medium, 9 Low)

## Severity Summary

| Severity | Count | Focus Areas |
| :--- | :---: | :--- |
| **High** | 8 | Index Drawer clipping & layout shift, persistent offline banner overlap, broken search filtering & `CLR` reset, broken `[RESET FILTERS]` button, wrong Practice topic chips, missing card pin/drag/resize UI |
| **Medium** | 15 | Transparent modal backdrops, broken keyboard shortcuts (`?`, `Space`, `F5`), Active Recall overflow & missing `Prev`, onboarding tour ring offsets, stale active borders, scroll-to-top, `CSE 109` 1-col lock, `GEN MATH` tab bleed, content mismatches, pending Practice modules, pre-starred JSON state |
| **Low** | 9 | Header `[INSTALL]` alignment, past-due default exam date, low text contrast & dim accordion fade-in, clipped `NOTE` placeholder, same-tab GitHub link, truncated labels & overlapping tooltips, horizontal formula overflow, missing theme switcher, disabled term placeholders |

## Master Triage Table

| ID | Severity | Area | Summary | Status |
| :--- | :---: | :--- | :--- | :---: |
| BUG-01 | High | Index Drawer | Left edge of drawer headings and course labels is clipped | Open |
| BUG-02 | High | Index Drawer | Clicking a topic fails to close/jump and shifts layout horizontally | Open |
| BUG-03 | High | Global UI | Persistent `Offline mode` pill overlaps toasts, buttons, and content | Open |
| BUG-04 | High | Search | `CLR` clears input text but leaves filtered results and highlights stuck | Open |
| BUG-05 | High | Search | Filtering delays or requires `Enter` after typing | Open |
| BUG-06 | High | Filters | `[RESET FILTERS]` button collapses to a tiny box with overflowing text | Open |
| BUG-07 | High | Practice Tab | Secondary modules display the first 6 topics of the entire course | Open |
| BUG-08 | High | Cards / HUD | No pin, drag, or resize controls despite shortcut modal advertising pinning | Open |
| BUG-09 | Medium | Modals & Menus | Overly transparent backdrops let underlying page text bleed through | Open |
| BUG-10 | Medium | Keyboard Shortcuts | Modal opens at top of document instead of viewport center; `?` key fails | Open |
| BUG-11 | Medium | Active Recall | `Space` key does not trigger `Reveal Answer [Space]` | Open |
| BUG-12 | Medium | Active Recall | Long cards overflow modal viewport; no `Prev` card button | Open |
| BUG-13 | Medium | Onboarding Tour | Highlight rings target wrong UI elements in `Take a Quick Tour` | Open |
| BUG-14 | Medium | Navigation | Floating scroll-to-top button only scrolls up a short distance | Open |
| BUG-15 | Medium | Navigation | Stale blue outline/border remains on previous tab or course pill | Open |
| BUG-16 | Medium | Keyboard Shortcuts | `F5` conflicts with browser refresh and targets pending Practice PDF Reader | Open |
| BUG-17 | Medium | Layout / Settings | `2-COL` / `1-COL` toggle has no effect on `CSE 109` | Open |
| BUG-18 | Medium | Theorems Tab | Clicking `GEN MATH` loads Formula/Reference cards inside Theorems tab | Open |
| BUG-19 | Medium | Search | Substring highlighting matches `"in"` inside unrelated words for `sin z` | Open |
| BUG-20 | Medium | Content (`CSE`) | `CSE` Definitions `#01` omits `Call by Value vs Call by Address` from body | Open |
| BUG-21 | Medium | Content (`MATH 159`) | Complex Numbers `#01` title says `z^4 + a^4` but formula box shows `z^4 + 4` | Open |
| BUG-22 | Medium | Practice Tab | All 12 practice modules are unpopulated (`MODULE PENDING`) | Open |
| BUG-23 | Medium | State / JSON | `"m159-complexnum:12": true` appears pre-starred in fresh JSON export | Open |
| BUG-24 | Low | Header | `[INSTALL]` button sits higher than adjacent countdown and gear icon | Open |
| BUG-25 | Low | Header | Default `EXAM DATE` (`11/15/2026`) is past-due and counts up with `+` | Open |
| BUG-26 | Low | Contrast / Motion | Low contrast on Context/Strategy pods; slow accordion fade-in starts dim | Open |
| BUG-27 | Low | Card Notes | Inline `NOTE` editor clips top half of first placeholder line | Open |
| BUG-28 | Low | Card Actions | Typo report (`!`) navigates to GitHub in same tab instead of new tab | Open |
| BUG-29 | Low | Labels / Tooltips | Truncated `LAST-NIGHT` & `GEN MATH` text; `M159` tooltip overlaps button | Open |
| BUG-30 | Low | Math Layout | Long equations overflow horizontally inside 2-column formula boxes | Open |
| BUG-31 | Low | Settings | No light/dark or custom theme switcher in Settings | Open |
| BUG-32 | Low | Term Switcher | `L-1 // T-2`, `L-2 // T-1`, and `L-2 // T-2` are disabled `[SOON]` items | Open |

## Detailed Bug Checklist

### High Severity

- [ ] **BUG-01 — Index Drawer left-edge clipping**
  - **Area:** Index Drawer
  - **Observed:** Opening the slide-over Index Drawer cuts off the left edge of headings and items (`INDEX` displays as `EX`, `EEE 101` as `E 101`, `MATH 157` as `TH 157`).
  - **Expected:** Drawer padding/transform keeps all left-aligned text fully visible inside the viewport.

- [ ] **BUG-02 — Index Drawer jump-to-topic fails and shifts page horizontally**
  - **Area:** Index Drawer / Layout
  - **Observed:** Clicking a topic link (such as `#fm-eee-thev`) leaves the drawer open, skips immediate scrolling, and shifts the entire page layout horizontally—clipping the left edge of the Dashboard (`0%` renders as `%`, `PHY` is cut off) and pushing the drawer's `X` close button to the far-left edge. Closing the drawer manually triggers the jump and restores alignment.
  - **Expected:** Clicking a topic closes the drawer cleanly and scrolls straight to the section with zero horizontal viewport shift.

- [ ] **BUG-03 — Persistent `Offline mode` banner overlaps active UI**
  - **Area:** Global Overlay / PWA Banner
  - **Observed:** The bottom-center `Offline mode · serving cached reference` pill remains visible even while online. It covers the onboarding tour's `Back` button, bottom toast notifications (`MULTI-COLUMN GRID VIEW`, `MARGIN NOTE SAVED`, `LAST-NIGHT SPRINT ACTIVE // 5/5 HIGH-YIELD UNLEARNED`, `COPIED LINK // ?card=...`), scrolled card titles, and table content.
  - **Expected:** Display the offline banner only when `navigator.onLine === false`, and stack/offset it so it never collides with toasts or modal controls.

- [ ] **BUG-04 — Search `CLR` button leaves filtered results and highlights stuck**
  - **Area:** Search
  - **Observed:** Clicking `CLR` empties the search input field, but the filtered counter (e.g., `8 / 491`), filtered card list, and yellow text highlights remain active until another UI action forces a re-render.
  - **Expected:** Clicking `CLR` immediately resets the query state, restores the full card count, and removes all highlights.

- [ ] **BUG-05 — Delayed and inconsistent search filtering**
  - **Area:** Search
  - **Observed:** Typing a query (e.g., `thevenin`) immediately shows `CLR` and collapses the dashboard, but the match counter (`491 / 491`) and visible cards do not update until pressing `Enter` or waiting through a noticeable lag.
  - **Expected:** Debounced search updates both the match counter and card list consistently as the user types.

- [ ] **BUG-06 — Broken `[RESET FILTERS]` button styling in empty state**
  - **Area:** Dashboard / Empty State
  - **Observed:** When active filters yield 0 cards (for example, selecting `EEE` with `Starred` active), the `[RESET FILTERS]` button container renders as a tiny narrow box (`[  ]`) while the `RESET FILTERS` label overflows outside its borders.
  - **Expected:** The button container auto-sizes cleanly around its label (`width: auto; white-space: nowrap;`).

- [ ] **BUG-07 — Wrong syllabus topic chips on secondary Practice modules**
  - **Area:** Practice Tab
  - **Observed:** Every secondary module of a course displays the first 6 topics of the entire course rather than topics belonging to that module:
    - `MATH 159 Vector Calculus` displays *Complex numbers* and *Cauchy-Riemann*
    - `PHY 121 Optics` and `Thermal Physics` display *SHM / Waves*
    - `EEE 101 Transients & Magnetics` and `AC Steady-State` display *DC Circuits*
    - `MATH 157 Integral Calculus` displays *Differential Calculus*
    - `CSE 109 Object-Oriented C++` displays *C basics*
  - **Expected:** Each module filters and displays only the topic chips mapped to its own syllabus scope.

- [ ] **BUG-08 — Missing card pinning, dragging, and resizing controls**
  - **Area:** Cards / Command HUD
  - **Observed:** `Keyboard Shortcuts` lists `Enter: Jump to / pin active result card` and `/ / Ctrl+K: Focus search bar (or Fullscreen HUD search)`, but neither `Ctrl+K` nor `ArrowDown` + `Enter` pins a card. Cards also show no pin, drag, or resize handles (the top-right link icon only copies a `?card=...` URL).
  - **Expected:** Either expose working pin/drag/resize interactions or remove unimplemented actions from the `Keyboard Shortcuts` modal.

### Medium Severity

- [ ] **BUG-09 — Overly transparent modal and dropdown backdrops**
  - **Area:** Settings / Modals / Dropdowns
  - **Observed:** The Settings menu, `Active Recall` (`Random Flashcard`) modal, `Keyboard Shortcuts` modal, and `L1 · T1` dropdown lack sufficient background opacity or blur, allowing underlying page text to bleed through and clash with foreground text.
  - **Expected:** Increase surface opacity and/or backdrop blur so overlays remain clearly legible over dense formula grids.

- [ ] **BUG-10 — `Keyboard Shortcuts` modal positioning and broken `?` trigger**
  - **Area:** Keyboard Shortcuts Modal
  - **Observed:** Opening `Keyboard Shortcuts` from Settings while scrolled down places the modal at the top of the document rather than centered in the current viewport. Pressing `Shift+/` (`?`) also fails to open the modal.
  - **Expected:** Use `position: fixed` centered in the viewport and bind `?` (`e.key === '?'`) outside text inputs.

- [ ] **BUG-11 — `Space` shortcut fails inside Active Recall modal**
  - **Area:** Active Recall (`Random Flashcard`)
  - **Observed:** Pressing `Space` does not trigger `Reveal Answer [Space]`, even though `S` (Skip) and `Escape` (Close) work normally.
  - **Expected:** Bind `Space` (with `e.preventDefault()` to prevent page scrolling) to reveal the flashcard answer.

- [ ] **BUG-12 — Active Recall tall-card overflow and missing `Prev` button**
  - **Area:** Active Recall (`Random Flashcard`)
  - **Observed:** Long flashcards extend below the bottom of the modal viewport, requiring scrolling to reach `[1] Needs Review` and `[2] Got It`. There is also no `Prev` control to step back to the previous flashcard.
  - **Expected:** Constrain card body height with an internal scroll container while keeping rating actions pinned at the modal footer, and add a `Prev` navigation control.

- [ ] **BUG-13 — Misaligned Onboarding Tour highlight rings**
  - **Area:** Onboarding (`Take a Quick Tour`)
  - **Observed:** Tour spotlight rings do not match the elements described in the step copy—Step 02 highlights the Mastery bar instead of the study mode tabs, and Step 04 highlights the tabs instead of the top-left Index Drawer button.
  - **Expected:** Update tour target selectors/coordinates so each spotlight ring aligns with the described control.

- [ ] **BUG-14 — Floating scroll-to-top button only scrolls partially**
  - **Area:** Navigation
  - **Observed:** Clicking the bottom-right up-arrow button scrolls up only a short distance instead of returning to the top of the page.
  - **Expected:** Scroll smoothly to `top: 0` on the active scroll container (`window` or main wrapper).

- [ ] **BUG-15 — Stale active borders on tabs and course pills**
  - **Area:** Navigation / Course Bar
  - **Observed:** Switching between `Formulas 491`, `Theorems & Definitions 161`, and `Practice 12` (including jumping via `Open MATH 159 formulas`) can leave a blue underline/border on the previous tab alongside the newly active tab. Switching from `M159` to `PHY` can similarly leave the `M159` course pill visually outlined.
  - **Expected:** Clear active/focus ring styles cleanly when another tab or course pill becomes active.

- [ ] **BUG-16 — `F5` shortcut conflicts with browser refresh and targets pending feature**
  - **Area:** Keyboard Shortcuts / Practice Tab
  - **Observed:** `Keyboard Shortcuts` lists `F5` for `Toggle Fullscreen Practice PDF Reader`, which conflicts with the standard browser page-reload key and points to a feature that does not exist while all 12 Practice modules are pending.
  - **Expected:** Remap to a non-browser-reserved shortcut (e.g., `F` or `Shift+F`) and hide or mark the shortcut until the Practice PDF Reader ships.

- [ ] **BUG-17 — `Single-Column Wide Cards` (`2-COL` / `1-COL`) ignored on `CSE 109`**
  - **Area:** Layout / Settings
  - **Observed:** Toggling `2-COL` / `1-COL` in Settings updates other courses, but `CSE 109` remains locked to a single column regardless of the selected setting.
  - **Expected:** Either honor the 2-column toggle on `CSE 109` or indicate explicitly that code-heavy courses force 1-column layout.

- [ ] **BUG-18 — `GEN MATH (44 REF)` bleeds into `Theorems & Definitions` tab**
  - **Area:** Theorems & Definitions Tab
  - **Observed:** Clicking `GEN MATH` while on `Theorems & Definitions` loads the 44 General Math formula/reference cards inside the Theorems view and shows `LAST-NIGH... 0 LEFT` with `0 / 652 (0%)` mastery.
  - **Expected:** Either switch to the `Formulas` tab when `GEN MATH` is clicked or disable/filter `GEN MATH` cleanly inside `Theorems & Definitions`.

- [ ] **BUG-19 — Noisy substring highlighting in Search**
  - **Area:** Search
  - **Observed:** Searching `sin z` highlights `"in"` inside unrelated words such as `"Solving"`, `"definitions"`, `"imaginary"`, and `"sinh"`.
  - **Expected:** Match whole tokens or full query substrings rather than highlighting short inner fragments across unrelated words.

- [ ] **BUG-20 — Content mismatch on `CSE` Definitions `#01`**
  - **Area:** Theorems & Definitions (`CSE`)
  - **Observed:** Card title reads `Structure vs Union, Call by Value vs Call by Address, malloc vs calloc`, but the body omits **Call by Value vs Call by Address** and instead covers `struct vs union`, `malloc vs calloc`, and `Dangling Pointer vs Memory Leak`.
  - **Expected:** Align the title and card body so all listed comparisons are present (or update the title to include `Dangling Pointer vs Memory Leak`).

- [ ] **BUG-21 — Title vs. formula mismatch on `MATH 159` Complex Numbers `#01`**
  - **Area:** Formulas (`MATH 159`)
  - **Observed:** Card `#01` is titled `Real quadratic factors of z^4 + a^4`, while the main formula box displays only the specific case `z^4 + 4 = (z^2 + 2z + 2)(z^2 - 2z + 2)` and places the general form in the note.
  - **Expected:** Display the general factorization for `z^4 + a^4` in the primary formula box and keep `z^4 + 4` as the worked example/note.

- [ ] **BUG-22 — All 12 Practice modules are unpopulated**
  - **Area:** Practice Tab
  - **Observed:** All 12 modules (`MATH 159` x2, `PHY 121` x3, `EEE 101` x3, `MATH 157` x2, `CSE 109` x2) display `MODULE PENDING` with no live practice problems.
  - **Expected:** Populate practice problem sets or label the tab clearly as coming soon until at least one module is live.

- [ ] **BUG-23 — Unexpected pre-starred card in default JSON export**
  - **Area:** Persistence / `Export / Import JSON`
  - **Observed:** Opening `Export / Import JSON` without starring any `MATH 159` card showed `"m159-complexnum:12": true` already present in `"starred"`.
  - **Expected:** Start new sessions with an empty `"starred"` object unless the user explicitly stars a card.

### Low Severity

- [ ] **BUG-24 — Misaligned `[INSTALL]` button in header**
  - **Area:** Header
  - **Observed:** The `[INSTALL]` button sits noticeably higher than the adjacent exam countdown and settings gear icon.
  - **Expected:** Vertically center all header controls along a shared flex baseline (`align-items: center`).

- [ ] **BUG-25 — Stale default `EXAM DATE` counts upward without label**
  - **Area:** Header / Doomsday Clock
  - **Observed:** `EXAM DATE` defaults to `11/15/2026` (in the past), causing the header countdown to count upward with a `+` (`FINALS + 11D : 04H : ...`) without indicating the exam date has already passed. (Changing the date via the picker immediately fixes the countdown.)
  - **Expected:** Default to an upcoming exam date or display a clear "Past exam date — click to update" state when the target date has passed.

- [ ] **BUG-26 — Low text contrast and slow accordion fade-in**
  - **Area:** Typography / Motion
  - **Observed:** `PARAMETERS // CONTEXT` and `APPLICATION // STRATEGY` text has low contrast against the dark card surface, and opening a topic accordion runs a slow opacity fade-in that leaves newly revealed cards dim right after clicking.
  - **Expected:** Raise text contrast on context/strategy pods to meet WCAG AA (>= 4.5:1) and shorten the accordion reveal transition.

- [ ] **BUG-27 — Clipped `NOTE` editor placeholder**
  - **Area:** Card Notes
  - **Observed:** Opening a card's inline `NOTE` editor initially clips the top half of the first line of placeholder text (`Jot down professor hints...`).
  - **Expected:** Adjust textarea `line-height` and top padding so placeholder text renders unclipped on open.

- [ ] **BUG-28 — Typo report (`!`) navigates away in the same tab**
  - **Area:** Card Actions
  - **Observed:** Clicking the warning triangle (`!`) on a card navigates to GitHub in the same browser tab.
  - **Expected:** Open external GitHub issue links in a new tab (`target="_blank" rel="noopener noreferrer"`).

- [ ] **BUG-29 — Truncated dashboard labels and overlapping tooltips**
  - **Area:** Dashboard / Course Bar
  - **Observed:** The Dashboard `LAST-NIGHT` button truncates (`LAST-NIGH... 59 LEFT`, `LAST-NIG... 292 LEFT`). Hovering `GEN MATH` truncates its tooltip (`Open general math reference (44 card...`), and hovering `M159` displays a tooltip (`Focus on MATH 159 · 0/134 done`) that overlaps the `5/5 HIGH-YIELD 34` button.
  - **Expected:** Widen or shorten button labels to avoid ellipsis truncation and adjust tooltip placement/max-width so tooltips never clip or overlap adjacent controls.

- [ ] **BUG-30 — Horizontal formula overflow in 2-column view**
  - **Area:** Math / KaTeX Layout
  - **Observed:** Long expressions in `GEN MATH` (`#01`, `#02`, coordinate/hyperbolic cards) and `ALL`, `M157`, and `EEE` theorem/derivation cards overflow horizontally in 2-column mode and require scrolling inside individual formula boxes.
  - **Expected:** Allow automatic line breaks where appropriate or auto-span extra-wide equation cards across 2 columns.

- [ ] **BUG-31 — No theme switcher in Settings**
  - **Area:** Settings
  - **Observed:** Settings has no light/dark or custom theme selector; only course-based accent colors change automatically.
  - **Expected:** Add a theme toggle if light/dark or custom themes are planned.

- [ ] **BUG-32 — Disabled `[SOON]` term options in `L1 · T1` switcher**
  - **Area:** Term Switcher
  - **Observed:** `L-1 // T-2`, `L-2 // T-1`, and `L-2 // T-2` are disabled `[SOON]` placeholders.
  - **Expected:** Track for future term rollout once content is ready.

## Verified Working in Pass 2

- **KaTeX & code rendering:** Formulas and C/C++ syntax-highlighted blocks rendered cleanly across `EEE`, `PHY`, `M157`, `M159`, `CSE`, and `GEN MATH` with no raw LaTeX or KaTeX error output.
- **Mastery, filters & persistence:** `Star`, `learned`, `Starred`, `Unlearned`, `LAST-NIGHT`, `Self-Test Blur`, and `Formula-Only View` update counters accurately and persist across page reloads.
- **Inline `NOTE` persistence:** Creating, editing, and saving card notes persists across reloads.
- **Deep-link navigation (`?card=...`):** Opening a copied card link (e.g., `?card=cse-c%3A2`) clears conflicting filters, switches courses, expands the topic, scrolls to the card, and highlights it.
- **Settings sync & Exam Date picker:** `Hide Context & Strategy Pods` and `Self-Test Blur Mode` stay synced with Dashboard toggles; updating `EXAM DATE` via the calendar picker immediately updates the header countdown.

## Not Verified in These Passes

- Browser DevTools console/runtime errors and network tab failures
- A4 print sheet layout output
- JSON file import dialog upload flow
- Browser PWA install prompt behavior
