# Build log

What was built each day, what broke, and what we changed and why. Newest day first.

## Sun 15 Nov 2026

### Built
- **Project setup.** Vite + React + TypeScript + Tailwind app. Firebase AI Logic client (`src/ai/client.ts`) with the Gemini Developer API and two models: one pinned to `ONLY_ON_DEVICE` (Gemini Nano in Chrome), one to `ONLY_IN_CLOUD`. Answers stream, and `inferenceSource` confirms where each one ran. A router (`src/ai/router.ts`) is the single entry point for generation. App Check uses the debug provider in development.
- **First hybrid calls.** Confirmed in Chrome on the development laptop: one answer on-device (Gemini Nano on the CPU path) and one from the cloud.
- **Public repo** with the Apache 2.0 license: https://github.com/SeyiBuilds/hybrid-study
- **PDF reader.**
  - Open or drop a PDF. Text is extracted per page with pdf.js, using a worker bundled with the app so it works offline.
  - Pages are rendered sharp on high-DPI screens. A page index, page controls and arrow keys turn pages.
  - Documents are kept on the device in IndexedDB. They reopen offline, on the page you left.
  - Pages with no text (scans, pictures of slides) are detected and explained.
  - On phones, the page and its text sit on two tabs.
- **Design system.** An exercise-book look: ruled sheet, red margin line, blue-black "biro" ink, highlighter-yellow text selection, and a night theme. Fonts are self-hosted: Archivo (condensed headings) and Literata (reading text). The connection test moved to a "Connection details" screen, opened from the status indicator.
- **Readable page text.**
  - Extraction rebuilds lines from where text sits on the page.
  - Running headers, footers and page numbers are removed.
  - Wrapped lines are rejoined into paragraphs, and words hyphenated across lines are put back together.
  - Headings, list items and contents entries ("Title … 9") are recognised.
  - The page index shows each page's heading.
  - Documents saved earlier are re-extracted automatically the next time they open.
- **Summarise.**
  - "Summarise this page" goes through the router.
  - Before you press it, the panel says where it will run and roughly how much data it will use.
  - The answer streams in as 3 to 5 bullets.
  - The margin records where it ran, how long it took and the data used.
  - Summaries are saved per page on the device, so they reopen instantly, offline and for free.
  - A summary that's still being written keeps going if you turn the page.

### What broke
- The first cloud call failed with `Firebase AI Logic genai config not found` (HTTP 400): AI Logic wasn't enabled in the Firebase console yet. The app's error message wrongly blamed the internet connection.
- App Check's token exchange returned 403 in a browser whose debug token wasn't registered.
- `npm audit` reported 4 high-severity advisories in `@grpc/grpc-js`.
- Commits would have shown the author as "unknown" (no Git name set), and the public repo would have exposed a personal email address.
- pdf.js 6 no longer has `PDFDocumentProxy.destroy()`, so the type check failed.
- At 1024 px wide, the reader left the PDF page only about 200 px wide.
- The first draft of the library rewrote the whole PDF in IndexedDB on every page turn.
- On a real 40-page study guide, the text panel was hard to read:
  - the running header and page numbers were read as content, so every page index entry looked the same
  - contents dot leaders and page numbers ran into the next entry ("2Contents")
  - every PDF line became its own line
- Adding the summaries store needed a database upgrade, and it was blocked by a tab still holding the old version open, so the library showed nothing.
- In the built-in test browser (no Gemini Nano, unregistered App Check token), cloud calls still return `Firebase AI Logic genai config not found`. Not yet explained, because the same call worked in Chrome.

### What we changed and why
- **Error messages:** errors now recognise "genai config not found" and point to the AI Logic setup step. The "check your connection" message only shows when the browser is actually offline.
- **npm audit advisories left alone:** the package is a server-side Firestore dependency that never ships to the browser, and the suggested `npm audit fix --force` would downgrade Firebase to v9, which has no AI Logic.
- **Git identity:** set a name and GitHub's noreply email for this repo only, and installed the GitHub CLI to create and push the repo.
- **Download check:** on-device requests check `LanguageModel.availability()` first. In `ONLY_ON_DEVICE` mode, the SDK doesn't wait for a model download it didn't start itself.
- **App Check in development:** a no-op provider, so the reCAPTCHA script isn't loaded locally. The debug token does the work there.
- **Closing PDFs:** added a `closePdf()` helper that uses `loadingTask.destroy()` (the pdf.js 6 API).
- **Reader layout:** the page index only shows on screens 1280 px and wider, and the text sheet is narrower, so the PDF page gets the space.
- **Library storage:** split into a small metadata store and a separate file store, so turning a page only updates a few bytes.
- **Document titles:** the title comes from the file name. PDF metadata titles are often junk like "Microsoft Word - lec4.docx".
- **Planning:** replaced the day-by-day schedule with a build order. Work moves to the next step as soon as one is pushed.
- **Text extraction:**
  - Text pieces are grouped into lines by position.
  - A header or footer is a line repeated at the top or bottom of at least 40% of pages, and those lines are dropped.
  - Lines are joined into paragraphs unless there's a vertical gap or the previous line ended short.
  - Headings are lines set at least 18% larger than the body text.
  - The text panel draws headings in Archivo and uses fainter ruled lines, so the words read first.
- **Database upgrades:** open database connections now close themselves when a newer version asks to upgrade.
- **On-device order:** on-device requests run one at a time. The SDK closes the previous on-device session when it starts a new one, so overlapping requests would cut each other off.
- **Data estimates:** cloud data use is estimated from the prompt and response size plus HTTP overhead. It's a rough figure, to be refined with the badges and data-saved counter.

### Still open
- The main JS bundle is 760 kB (pdf.js + Firebase). Split the reader into its own chunk in the design pass.
- The hosted site needs a real App Check provider (reCAPTCHA Enterprise) at the deploy step, because visitors have no debug token.
- Test extraction on more real lecture PDFs: multi-column layouts and slide decks.
- Confirm Summarise in Chrome, both on-device and in the cloud, and work out why the test browser gets "genai config not found".
