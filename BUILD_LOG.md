# Build log

What was built each day, what broke, and what we changed and why. Newest day first.

## Fri 27 Nov 2026

### Built
- **Live at https://fir-ai-hackathon-9162d.web.app** on Firebase Hosting.
- **App Check for everyone, not just the developer.** The hosted build uses a reCAPTCHA Enterprise key (free tier, no billing account), registered in Firebase App Check, so judges' browsers get App Check tokens without a debug token.
- **The study sheet keeps its full width** (up to 34rem) beside the page; only the page list folds away.

### What broke
- **The first upload stopped at 19 of 91 files** when the connection dropped. Firebase Hosting keeps the files it already has, so the retry only sent the rest and finished.
- **PowerShell 5 adds a byte-order mark** when it writes UTF-8, which would have hidden the first setting in `.env` from Vite. The file was rewritten without one.

### What we changed and why
- **App Check token lifetime: 1 day.** A token is fetched from reCAPTCHA when it runs out. For students on patchy, metered connections, fewer refreshes mean less data and fewer chances to fail mid-study, and a day keeps far inside the free 10,000 checks a month.
- **Checked the live site in a clean Chrome profile:** it loads, is installable, its service worker is active, robots.txt and sitemap.xml are served, reCAPTCHA Enterprise and App Check return tokens (HTTP 200), a real cloud request answered (HTTP 200), and Chrome's Prompt API is present on the hosted address, so no origin trial token is needed.

### Still open
- Seyi to try the live site in his own Chrome: on-device answers, the Wi-Fi-off queue and an exam.
- Google Search Console: add the site, verify it and submit the sitemap.
- Diagrams in explanations.

## Thu 26 Nov 2026

Seyi used the app for a week as a student and wrote up what he wanted changed. Working through that list.

### Built
- **Page list that folds away.** An icon in the top corner of the page list folds it to a thin rail (and back), giving the lecture note and the study sheet the room. The choice is remembered.
- **One bar for the page.** Previous and next, the page number, zoom (75% to 250%, or the + and - keys; press the percentage to fit the width again) and enlarge sit together in one bar floating at the foot of the page. Enlarged, the page fills the screen; Escape brings the sheet back.
- **Exam mode beside the document title** in the top bar, as a document-level action.
- **One set of controls.** Run AI on, the quiz settings, exam setup and the results filter all use the same segmented switch.
- **Sharper pages.** Pages are drawn at least twice the screen's pixel density, so small print and formulas in scanned textbooks stay readable.
- **Formulas on their own lines, typeset.** Summaries and answers now put every formula or calculation step on its own line under the bullet it belongs to, typeset with KaTeX (fractions, powers, subscripts, Greek letters). Equations the model writes inline anyway, in backticks or single dollar signs, are lifted onto their own line too, and powers like 10^4 show as 10⁴. KaTeX is bundled with the app, so formulas render offline.
- **Broken symbols repaired.** Text from the PDF no longer shows empty boxes: "VARIGNON□S" now reads "VARIGNON’S", and "w □ mg" reads "w = mg". Documents are re-read once on open to pick this up.
- **Explanations show their working.** When an answer involves a calculation, the model is asked to show each step and say why it is done.
- **Quiz settings.** Choose 5, 10 or 15 questions and Easy, Medium, Hard or Mixed before writing a page quiz. The choice is remembered.
- **Exam mode.** "Exam mode" above the page opens a timed exam on the whole lecture note (or a page range):
  - 20, 40 or 60 questions; multiple choice only, or multiple choice plus a written section (2, 4 or 6 theory questions); Easy, Medium, Hard or Mixed; 15 minutes to 2 hours.
  - Past questions: add a past-paper PDF for the course and the new questions follow its style and difficulty without copying it. It stays on the laptop.
  - Taking it: the notes close, a timer counts down, a numbered grid shows what is answered, and answers are saved as you go (a reload loses nothing). When time runs out the paper is handed in by itself.
  - Marking: multiple choice is marked on the laptop at once; written answers are marked by the AI against a model answer and key points. Results show the grade (A to F, Nigerian university scale), marks per section, a green tick or red cross per question, the correct answer, a tip for each missed question, and feedback and a correction for written answers. "Explain this more" gives a fuller explanation with the working; "Missed" shows only the ones to revise; "Retake these questions" starts the same paper again.
  - Past exams on a lecture note are listed with their grades.
- **Installable, and opens offline.** The built app has a web manifest, icons and a service worker that saves the app shell, fonts, formula fonts and the PDF engine on the device (55 files, 3.6 MB). After one visit, the library and documents open with no connection at all. AI requests are never cached. When a new version is deployed, a small note offers "Reload" rather than reloading in the middle of an answer or an exam.
- **Ready for Firebase Hosting.** `firebase.json` (with long caching for hashed files and none for the service worker), `npm run deploy`, robots.txt, sitemap.xml, a page description and sharing tags.
- **Green and red marking.** Marked quizzes show a green tick and green answer for each question you got right, and a red cross with your wrong answer struck through in red. The circled score is green from half marks up.

### What broke
- **Controls added "anywhere and anyhow".** The first version of these features put "Hide pages", "Exam mode", zoom and "Enlarge" in a row of labelled buttons above the page, and the quiz settings as loose words on the sheet. At Seyi's real screen size (1280 by 720 at 150% scaling) the labels wrapped and the row looked like an afterthought.
- **Pages cut off at the bottom.** Making the page scroll sideways when zoomed also turned it into its own scroll box, which the layout squashed to the window height, so the bottom of every page was clipped.
- **Pages were hard to read in the app.** Textbook pages with formulas looked soft, there was no way to zoom, and the page list took space Seyi wanted for the page and the sheet.
- **Formulas were unreadable.** In fluid mechanics and statics notes, summaries ran equations into sentences (`p1/rV1^2 + gz1`), showed backticks and carets, and some symbols came out as empty boxes.
- **Quizzes were always five questions at one level,** and there was no way to practise under exam conditions.
- **Installing the hosting tools failed** with "host unreachable" while the connection dropped. Retried later.

### What we changed and why
- **Controls grouped by what they act on:** page tools in one bar on the page, the page list's toggle on the page list, the exam (which is about the whole document) next to the document's title, and quiz options only shown before writing questions. Checked in screenshots at 1280 by 720 and on a phone.
- **The page box takes its full height** and the page area scrolls instead; sideways scrolling is only switched on when zoomed in.
- **Extra drawing density, with a ceiling.** The page canvas is drawn at 1.5 times the screen density (at least 2x) but kept under about 4,000 pixels wide, so zooming in doesn't eat memory on a 16 GB laptop.
- **Why the boxes appeared:** many textbook PDFs store punctuation as old Windows codes (the apostrophe as U+0092) and maths symbols in the Symbol font's private character range (= as U+F03D, ρ as U+F072). No font can draw those, so they showed as boxes and the AI saw nonsense. They are now mapped back to the real characters when the text is extracted.
- **LaTeX for summaries and answers, plain symbols for quizzes.** Summaries and answers are plain text, so LaTeX between $$ signs is safe and typesets well. Quiz questions come back as JSON, where LaTeX backslashes break the format, so quizzes use plain symbols such as ×, ², √ and V₁ instead.
- **Exams are written in the cloud by default.** An exam is a "hard" task for the router: 40 or 60 questions would take many minutes on a laptop running Gemini Nano on its CPU, so with a connection they are written in the cloud in batches of 10, each from a different part of the notes, and the setup screen says roughly how much data that uses. Offline, it says so and offers to write the exam on the laptop instead. Choosing "This laptop" under Run AI on also keeps it local.
- **Written answers are marked by the AI, objective ones are not.** Multiple choice has one right answer, so the laptop marks it instantly and for free. Written answers need judgement, so each is marked against the model answer and key points the exam was written with. If the connection drops while marking, the laptop marks the rest; finished marks are saved one by one.
- **New formats get their own model pair.** Firebase AI Logic fixes the output schema per model instance, so written questions and marking each have an on-device and a cloud model with their own JSON schema, like quizzes.
- **Marks in the colours students expect:** green for right, red for missed, keeping the drawn tick and cross rather than emoji.

### Still open
- Diagrams in explanations.
- Going live: Seyi to create the reCAPTCHA Enterprise key and register it in App Check, and sign in to the Firebase CLI, then deploy. Then Google Search Console.
- Seyi to try a real exam with the on-device model and the cloud on his own lecture notes.

## Sun 22 Nov 2026

### Built
- **"No internet" handling.** When a cloud request fails for network reasons while the browser still says online:
  - the app treats the connection as offline
  - hard questions go into the offline queue
  - work the laptop can do is answered there instead
  - the top bar says "No internet"
- **Internet check.** While the cloud is unreachable, the app checks every 15 seconds whether it's back: a small request to the Firebase AI Logic host it already uses. When the check gets through, the queue is sent.
- **Cloud timeout.** Cloud requests that haven't started answering after 45 seconds now give up (the SDK default is three minutes), so a dead connection is noticed quickly.
- **A clearer study sheet.** The right-hand side now has four tabs, Summary, Ask, Quiz and Notes, so one tool is on the sheet at a time:
  - "Run AI on" sits above the tabs as a switch, with a coloured dot and one line on where requests go right now.
  - Each tab opens with a plain heading ("Summary of page 3", "Ask about page 3") and a line on what it does.
  - Every answer carries a badge: where it ran, how long it took and the data it used, for example "This laptop · 6.1 s · no data used".
  - A tab shows a dot while something behind it is working, queued or failed, so nothing is missed on another tab. The open tab is remembered.

### What broke
- **A red "Error fetching … Failed to fetch".** Seyi asked "Compare XOR gate and the OR gate" while the top bar said Online. The router sent it to the cloud (hard question), but the internet wasn't getting through, and the student saw a raw error. `navigator.onLine` only means the laptop is connected to a network, not that the internet works, which is common with an empty data bundle or a router that has lost its connection.
- **The study sheet was hard to read.** Seyi said the right-hand side was too mushed together to understand. Everything sat on one long ruled sheet (the switch, summary, questions, quiz, notes and page text), the section titles were tiny grey capitals, and where each answer ran was written as single words in the margin ("device", "p. 3", "latest") that didn't explain themselves.
- **The new test failed on its first run.** It let App Check's token exchange go to the real network, which held up the first cloud request past the test's wait. The test now makes that exchange fail too, as it would with no internet. A test bug, not an app bug.

### What we changed and why
- **Network failures are told apart from refusals.** The SDK reports them as "Failed to fetch", or as a timeout abort, with no HTTP status. Real refusals such as an App Check 403 still show an error rather than being queued.
- **The router decides again after a network failure.** Once the cloud is marked unreachable, the same request is re-routed as if offline: the laptop answers if it can, otherwise the request is queued. Any successful cloud answer marks the cloud reachable again.
- **The queue flusher follows the app's own view of the connection,** not only the browser's `online` event, which never fires in this situation.
- **Tabs instead of one long sheet,** because a student uses one tool at a time and the page number already says which page the sheet is for. The ruled paper and red margin stay; the margin now only holds quiz numbers, ticks and the circled score, which read naturally.
- **Badges instead of margin words,** because "This laptop · 6.1 s · no data used" says what happened without a legend. It is also the per-answer badge planned from the start.
- **The sheet scrolls on its own** while the switch and tabs stay in view, and the sheet column is a little wider.
- **Tested in headless Chrome** with screenshots of every tab in dark and light mode and on a phone (no sideways scrolling). The five test suites were updated to open the right tab, as a student would, and all pass.
- **Tested in headless Chrome** with the browser saying online while every cloud request fails: the hard question queued, a simple one answered on the laptop, the slow-laptop fallback worked, the queue was sent once the "internet" came back, and a 403 still showed an error. The queue, router, quiz and speed suites still pass.

### Still open
- Seyi to retry the same question with his real patchy connection.

## Fri 20 Nov 2026

### Built
- **Offline queue.**
  - A hard question asked offline is marked "Queued" on the study sheet. The moment the browser comes back online, it goes to the cloud on its own and the answer appears in place.
  - Each queued item offers "Answer on this laptop now" (when the on-device model is ready) and "Cancel".
  - Summaries, quizzes and questions also queue when they can't run offline: when the on-device model isn't available, or when the student chose Cloud.
  - The queue is saved on the device. It survives a reload or closing the tab, and is sent on the next visit if the connection is back.
  - The top bar shows how many items are waiting.
- **Explain this.** A new "Explain" button on the selection toolbar asks for a plain-words breakdown of the highlighted words, routed like any other question.

### What broke
- The test for Chrome's own offline mode failed at first because the test's simulated `navigator.onLine` was still masking the real one. A test bug, not an app bug.

### What we changed and why
- **Offline, hard questions now queue for the cloud** instead of running on the laptop. That's what the brief's demo calls for: ask a hard question offline, it queues, the answer arrives when Wi-Fi returns. Simple tasks offline still run on the laptop, and "Answer on this laptop now" covers anyone who would rather not wait.
- **The router defers instead of failing.** A request that can't run now is marked deferred. The job store puts it in the queue with enough detail to rebuild it later from the stored document. No prompt text and no student data leave the device until it's sent.
- **Cloud is no longer greyed out offline.** Choosing Cloud while offline now means "wait for the connection".
- **Tested in headless Chrome:**
  - queuing, the reload, sending on reconnect
  - Answer now and Cancel
  - queued summaries and quizzes
  - Explain
  - a full round trip in Chrome's own offline mode
  
  The router, quiz and speed suites still pass.

### Still open
- Seyi to try it for real: Wi-Fi off, ask a hard question, Wi-Fi back on.
- Firestore and Remote Config are next.

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
