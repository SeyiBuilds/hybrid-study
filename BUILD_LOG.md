# Build log

What was built each day, what broke, and what we changed and why. Newest day first.

## Thu 19 Nov 2026

### Built
- **Writing boxes.** The question box, My notes, highlight notes and summary editing now sit in visible boxes, like answer boxes on an exam paper. Each darkens when you click in.
- **The question box** is two lines tall, says "Type your question here…", and grows as you type.
- **Ask now comes before Quiz** on the study sheet.
- **Router v2.**
  - **Speed check.** A short task (summarise one paragraph in a sentence) runs once on the laptop in the background, when no student request is using the model. The result is remembered. If it takes longer than 12 seconds, the laptop counts as slow, and Auto sends everyday tasks to the cloud while the connection is usable. "This laptop" still keeps everything local.
  - **Warm-up.** The on-device model is loaded into memory when the app opens.
  - **Data-saved counter.** Each on-device answer adds what the same request would have cost in the cloud (prompt and answer size plus overhead) to a running total in the top bar. Connection details shows data saved, cloud data used, and this laptop's speed, with buttons to check the speed again and to reset the counter. Speed checks and connection tests aren't counted.
  - The answer badges were already in place: every summary, answer and quiz records where it ran, the time taken and the data used.

### What broke
- **No visible place to type a question.** The box was one line of grey placeholder text with no border, so it read as a label, and its outline only appeared after clicking in. Ask also sat below the quiz, so once five questions were showing it ended up far down the sheet.
- **A test failed on a moving connection estimate.** Chrome's own connection estimate can briefly read as very weak. When it did, the router (correctly) kept work on the laptop, and the test expecting the cloud failed.

### What we changed and why
- **Writing areas get a border and a tinted background.** Blank ruled lines alone weren't enough to say "type here".
- **The focus style moved into Tailwind's base layer.** Unlayered CSS always beats component styles, so the writing boxes couldn't draw their own focus state until it moved.
- **Tested in headless Chrome at 1920 px wide** with real mouse and keyboard input. The router and quiz checks still pass.
- **The speed check uses the router,** pinned to the laptop, so all generation still goes through Firebase AI Logic. Only the warm-up touches Chrome's `LanguageModel` directly: it opens an idle session and generates nothing.
- **Until the speed check has run, the laptop counts as fast,** so nothing spends data on a guess.
- **Tests now pin the connection,** so they check the rules rather than Chrome's estimate. Speed, router and quiz checks all pass.
- **Speed limit raised from 8 s to 12 s.** On the development laptop (Intel i7-10610U, CPU only), the real speed check took 7.3 s while a large download was running. That's just under the old limit, so a check taken at a busier moment could have pushed everyday work to the cloud. The brief says CPU-only laptops are the case to design for, so they should keep simple tasks local.
- **Checked in Chrome with the real models:** a hard question ("Compare the XOR and XNOR gates step by step") went to the cloud (19 s, ~5 KB, during a large download), and the margin badges show where each answer ran.

### Still open
- Router v1 and v2: still to check with Wi-Fi off and with throttling, and the cloud answer time on a free connection (19 s was measured during a large download).
- Offline question queue and Explain this are next.

## Wed 18 Nov 2026

### Built
- **Redesigned "Run AI on".** Auto, This laptop and Cloud now sit on a ruled line as plain words, and the chosen one is underlined in red. The margin shows where AI will actually run right now (`device`, `cloud` or `none`), and the line below says why.
- **Quiz me.**
  - Five multiple-choice questions from the current page, written on-device or in the cloud through the router.
  - You circle answers in biro-blue. "Mark my answers" then adds red ticks and crosses in the margin, a circled score, the right answers and a short explanation for each question.
  - Quizzes, answers and scores are saved per page on the device. They survive reloads, and you can retry the same questions or ask for new ones.
  - Pages without enough real text, such as a contents page, don't offer a quiz.
  - Confirmed working in Chrome with the real models.
- **Router v1.** Auto now decides per request from four things: whether the on-device model is ready, the connection (offline, slow or solid, plus whether the cloud is usable at all), how hard the task is, and the browser's data saver.
  - Simple tasks stay on the laptop. Hard questions go to the cloud when the connection allows.
  - The student's own "This laptop" or "Cloud" choice always wins.
  - Each section says where a request will run and why before you press the button. As you type a question, the line changes if it counts as hard.
  - "How it decides" shows what the router sees and its last five decisions with reasons.
  - Cross-page questions sent to the cloud include text from nearby pages.

### What broke
- The labels in the old pill-shaped switch sat too low and were cut off. The buttons were 20 px tall but inherited the sheet's 30 px line height.

### What we changed and why
- **Routing rules follow the project brief's order,** in one pure function, so the same logic drives both the real request and the preview shown before it. Thresholds sit in one file, ready for Remote Config.
- **Question difficulty uses wording, not AI.** Asking a model whether a question is hard would cost the time or data the router is trying to save. Multi-step wording, references to other pages and very long questions count as hard.
- **Device speed is assumed fast enough for now.** The benchmark arrives in Router v2, and the rule that uses it is already in place.
- **One schema, both models.** Firebase's hybrid guide passes the same `Schema` to `responseConstraint` and `responseSchema`. Model configuration is fixed per instance, so quizzes have their own on-device and cloud models.
- **Validate everything.** A schema doesn't guarantee a usable quiz. Each reply is parsed and checked for four distinct options and a real answer. Bad questions are dropped, at least three must survive, and an unusable reply is requested once more.
- **The answer is a letter, and options are shuffled in code,** because small models tend to put the right answer first. Options like "All of the above" keep their order.
- **Dropped the pill.** It looked pasted onto the ruled paper, so the options now follow the sheet's own lines.
- **Real radio buttons underneath.** Arrow keys move the choice without turning the PDF page, and options that can't work right now (Cloud while offline, This laptop without on-device AI) are disabled.
- **Tested in headless Chrome** across every state: each choice, keyboard, offline, no on-device AI, light and dark themes.

### Still open
- Try Router v1 in Chrome with DevTools network throttling and with Wi-Fi off. Automated tests used simulated connections and scripted model replies.
- Router v2 is next: device speed benchmark, session warm-up, answer badges and the data-saved counter.
- Hosting comes at the deploy step. Until then the app needs the local dev server; after that, students just open a link.

## Mon 16 Nov 2026

### Built
- **Summarise confirmed in Chrome** on the development laptop, on-device.
- **Highlight on the page itself.**
  - pdf.js's text layer now sits over each rendered page, so words can be selected like in any PDF reader.
  - A small toolbar over a selection offers three highlighter colours (yellow, green, pink), "Add note" and "Ask".
  - Clicking an existing highlight lets you recolour it, add or edit its note, ask about it, or remove it.
  - Highlights are stored as rectangles relative to the page, so they stay in place at any size.
- **A study sheet for every page.** The ruled sheet beside the page now holds:
  - the "Run AI on" switch
  - the summary
  - "Ask about this page"
  - "My notes"
  - the page's highlights with their notes
  - the text the AI reads, folded away until you open it
- **The student's own writing** (questions, notes, edited summaries) is set in biro-blue and marked "you" in the margin. AI answers carry where they ran, the time and the data used.
- **Editable summaries.** "Edit" turns a summary into your own words, and the margin then marks it "edited".
- **Ask about this page.** Type a question, or press "Ask" on a highlight to attach those words. Answers stay on the sheet.
- **Run AI on: Auto / This laptop / Cloud.** One switch for the whole sheet. Auto lets the router decide, and each section says where a request will run and roughly what it costs before you press the button.
- **`start-dev.cmd`.** Double-click it to run the dev server in its own window.

### What broke
- **Answers were typed out word by word.** On a CPU-only laptop that made on-device answers feel slow and unsettled.
- **The ask-a-question test seemed to have disappeared.** It had moved to "Connection details" behind the status indicator, where it was easy to miss.
- **The dev server kept stopping.** Servers started from a coding session (a preview, a terminal tab, a background process) are stopped when that session or command ends. One server also hung after its output pipe closed.
- **The built-in browser pane couldn't draw while hidden,** so it couldn't be used to check rendering and selection.
- **A saved document wouldn't open:** "Setting up fake worker failed: Failed to fetch dynamically imported module … pdf.worker.min.mjs".
  - The app had loaded, then its dev server stopped. A test script had cleared the dev server's port and stopped the server when it finished.
  - pdf.js downloads a fresh worker every time a document opens, so with the server gone, no PDF could open.
  - The same thing would happen to a student whose connection drops after the app loads.
- **Unverified browsers get a misleading error.** Two test browsers whose App Check debug tokens weren't registered both got `Firebase AI Logic genai config not found` from the cloud, while the registered Chrome works. The app's message blamed only the AI Logic setup.

### What we changed and why
- **Whole answers.** Generation still streams under the hood, to measure time to the first token, but answers appear whole when ready. While waiting, the margin shows where it's running and a clock, and a thin line is drawn along the paper.
- **Asking moved into the reader,** as "Ask about this page", with the Run AI on switch to choose where it runs.
- **New storage.** The database moved to version 3, adding stores for highlights, notes and answers, each indexed by document and page. Removing a document clears everything written about it.
- **Text layer CSS.** Only the rules the text layer needs were copied from pdf.js's viewer stylesheet (also Apache 2.0), rather than loading the whole stylesheet.
- **Page sizing** reacts to size changes directly instead of waiting an extra animation frame.
- **Testing.** Highlighting, notes and asking were checked end to end by driving the installed Chrome headless with a throwaway profile: select, highlight, note, ask, then check the database.
- **The "genai config not found" message** now names both likely causes: an unverified App Check token, or AI Logic not set up.
- **One PDF worker for the whole app.**
  - It's started as soon as the app loads and reused for every document, instead of downloaded each time one opens.
  - A headless test confirmed it: load the app, stop the server, open a saved document. That failed before the change and works after it.
  - If a document still can't open, the reader now explains it in plain words and offers a Reload button.
- **Test scripts** run their own dev server on a separate port and never stop a process they didn't start.

### Still open
- Seyi to try highlighting, notes and asking in Chrome, on-device and in the cloud.
- Highlights on scanned pages: there's no text layer to select, so these pages can't be highlighted yet.
- Quiz step next.

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
- The local app stopped opening. The dev server had been started inside a coding session and stopped when that session restarted. Restarting it from PowerShell then failed, because script execution is disabled on the development laptop and `npm` is a PowerShell script there.
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
- **Dev server:** it now runs in its own terminal, using `npm.cmd`, which bypasses the blocked PowerShell script without changing any security setting. The README notes this for other Windows users.
- **Data estimates:** cloud data use is estimated from the prompt and response size plus HTTP overhead. It's a rough figure, to be refined with the badges and data-saved counter.

### Still open
- The main JS bundle is 760 kB (pdf.js + Firebase). Split the reader into its own chunk in the design pass.
- The hosted site needs a real App Check provider (reCAPTCHA Enterprise) at the deploy step, because visitors have no debug token.
- Test extraction on more real lecture PDFs: multi-column layouts and slide decks.
- Confirm Summarise in Chrome, both on-device and in the cloud, and work out why the test browser gets "genai config not found".
