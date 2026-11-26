# Hybrid Study

A study companion for students with patchy, expensive internet. Open a lecture PDF and get summaries, quizzes and explanations from AI that **runs on your laptop when it can and in the cloud when it must**. A router picks where each request runs, based on the network, how hard the task is and how fast your device is, so the app keeps working offline and only spends data when it's worth it.

Built for the [#BuildHybridAI 2026 hackathon](https://firebasehybridaihackathon.devpost.com/) with [Firebase AI Logic](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference) hybrid inference (Gemini Nano in Chrome + Gemini in the cloud).

> **Status:** in active development. Working now: open a lecture PDF, highlight and take notes on it, then summarise, question and quiz yourself on any page, with a router that picks the device or the cloud for each request, a running count of the data saved, and an offline queue that answers hard questions when the connection comes back. Saving progress with Firestore and tuning the router with Remote Config are next. See [BUILD_LOG.md](BUILD_LOG.md) for progress.

## Features

- **PDF reader.** Open or drop a PDF and read it page by page. Running headers, footers and page numbers are stripped from the text the AI reads, and paragraphs, headings, lists and contents entries are rebuilt. Pages that are scanned images are flagged.
- **Comfortable reading.** Hide the page list, zoom from 75% to 250% (or press + and -), or enlarge the page to fill the screen. Pages are drawn at extra density so small print and formulas stay sharp.
- **Highlight on the page.** Select words on the PDF itself and mark them with a yellow, green or pink highlighter. Click a highlight to recolour it, add a note, ask about it or remove it.
- **A study sheet for every page.** A ruled sheet beside the page with four tabs: Summary, Ask, Quiz and Notes (your own notes in "blue biro" and the page's highlights with their notes). Summaries can be edited into your own words. A tab shows a dot while something behind it is working or waiting.
- **Formulas that read like a textbook.** Formulas and calculation steps go on their own lines under the point they belong to, typeset with KaTeX (fractions, powers, subscripts, Greek letters). Symbols that PDFs store in old encodings, which usually show as empty boxes, are repaired when the text is read.
- **Summarise a page.** 3 to 5 bullets, shown whole when ready. Every answer carries a badge with where it ran, how long it took and roughly how much data it used, for example "This laptop · 6.1 s · no data used".
- **Quiz me.** 5, 10 or 15 multiple-choice questions from the page, easy, medium, hard or mixed. Choose your answers, then the sheet marks them like a script: a green tick or red cross in the margin, the right answer in green, a circled score and a short explanation for each question. Quizzes and scores are saved on the device.
- **Exam mode.** A timed exam on a whole lecture note or a page range: 20, 40 or 60 questions, multiple choice with an optional written (theory) section, a chosen difficulty and time limit. Add a past-paper PDF and the new questions follow its style and difficulty without copying it. The notes close, a timer runs, answers save as you go, and the paper is handed in when time is up. Multiple choice is marked on the device; written answers are marked by the AI against a model answer. Results show the grade (A to F), a tick or cross per question, the correct answer, tips for missed questions, and "Explain this more" for a fuller explanation.
- **Ask about this page.** Type a question, or ask about highlighted words. Answers are kept on the sheet.
- **Explain this.** Select words on the page and press Explain for a plain-words breakdown.
- **Offline queue.** A hard question asked offline is marked "Queued" and goes to the cloud by itself the moment the connection returns (or press "Answer on this laptop now"). The same happens to any request that can't run offline because the on-device model isn't available, or because you chose Cloud. The queue is saved on the device, so it survives a reload, and the top bar shows how many items are waiting.
- **Connected but no internet.** If Wi-Fi is up but the cloud can't be reached (no data left, a router without a connection), the app treats it as offline: the top bar says "No internet", the laptop answers what it can, and hard questions join the queue. Every 15 seconds it quietly checks the cloud's address (the same Google host it already uses), and sends the queue as soon as the internet is back, since the browser doesn't announce that.
- **Run AI on: Auto, This laptop or Cloud.** Auto lets the router decide per request from the connection (offline, slow or solid), how hard the task is, the browser's data saver and whether the on-device model is ready. Simple tasks stay on the laptop, and hard questions use the cloud when the connection allows. The sheet says where a request will run, why and what it will cost before you press the button, and "How it decides" lists recent decisions with their reasons.
- **Data-saved counter.** Every answer made on the laptop adds what the same request would have cost in the cloud to a running total in the top bar. Connection details shows the full count, cloud data used included.
- **Knows this laptop's speed.** A short speed check runs once in the background. On a slow laptop, Auto sends everyday tasks to the cloud while the connection is good (choose "This laptop" to keep them local). The model is also loaded into memory when the app opens, so the first request doesn't wait for it.
- **Kept on your device.** Documents, highlights, notes, summaries and answers are stored in the browser (IndexedDB), work offline and remember the page you were on. Nothing is uploaded when you open a file.
- **Connection details.** Opened from the status indicator in the top bar: sends the same question to Gemini Nano in Chrome and to Gemini in the cloud, showing where each answer ran and how long it took.

## How Firebase AI Logic is used

- `src/ai/client.ts` creates two Firebase AI Logic models with the Gemini Developer API backend: one pinned to `InferenceMode.ONLY_ON_DEVICE` (Gemini Nano through Chrome's Prompt API) and one pinned to `InferenceMode.ONLY_IN_CLOUD`. Requests use `generateContentStream` (for time-to-first-token), answers are shown whole, and `response.inferenceSource` confirms where each one ran. On-device requests run one at a time.
- `src/ai/router.ts` is the single entry point for generation. It decides per request which model to use (or follows the student's "Run AI on" choice) and returns a short reason string. Inputs come from `navigator.connection` (`src/lib/network.ts`), question difficulty (`src/ai/difficulty.ts`) and on-device availability; thresholds live in `src/ai/routerConfig.ts`.
- Cross-page questions routed to the cloud get text from nearby pages of the document. On-device requests stay within the current page.
- Quizzes use structured output: one `Schema` is passed as `responseConstraint` on-device and `responseSchema` in the cloud (`src/ai/quiz.ts`). Every reply is still parsed and validated, and an unusable reply is requested once more.
- App Check protects the cloud calls (debug provider in development).

## Requirements

- Node.js 22 or newer
- Desktop Chrome 148 or newer for on-device AI (other browsers still work through the cloud)
- For Gemini Nano on your machine: Windows 10/11, macOS 13+ or Linux, at least 22 GB free disk space, and either a GPU with more than 4 GB VRAM or 16 GB RAM with 4+ CPU cores. See [Chrome's hardware requirements](https://developer.chrome.com/docs/ai/get-started).
- A Firebase project (the free Spark plan is enough)

## Setup

1. **Clone and install**

   ```powershell
   git clone https://github.com/SeyiBuilds/hybrid-study.git
   cd hybrid-study
   npm install
   ```

2. **Create the Firebase project**
   - In the [Firebase console](https://console.firebase.google.com/), create a project (Google Analytics is not needed).
   - Go to **AI Services > AI Logic**, click **Get started** and choose the **Gemini Developer API**.
   - In **Project settings > General > Your apps**, register a **Web** app (`</>` icon).

3. **Add your config**

   ```powershell
   Copy-Item .env.example .env
   ```

   Fill in `.env` with the values from the web app's `firebaseConfig`.

4. **Run it**

   ```powershell
   npm run dev
   ```

   Open http://localhost:5173 in Chrome.

   On Windows you can instead double-click `start-dev.cmd`, which runs the dev server in its own window. If PowerShell says "running scripts is disabled on this system", use `npm.cmd` instead of `npm` (for example `npm.cmd run dev`).

5. **Register the App Check debug token**
   - Open Chrome DevTools (F12) > Console and copy the value after `Firebase App Check debug token:`.
   - In the Firebase console, go to **Security > App Check > Apps**, open the menu next to your web app, choose **Manage debug tokens** and add it.
   - Reload the page. Keep this token private; it is stored only in your browser.

6. **Get the on-device model**
   - In Chrome DevTools on the app page, run:
     ```js
     await LanguageModel.availability({expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]})
     ```
   - `available` means ready. If it says `downloadable`, click **Download on-device model** in the app. Progress is also visible at `chrome://on-device-internals`.

## Deploy to Firebase Hosting

The hosted app is a static build (`dist/`) with a service worker, so it opens offline once it has been visited.

1. **App Check for the hosted site.** Browsers outside your machine have no debug token, so the hosted build uses reCAPTCHA Enterprise (free up to 10,000 checks a month, no billing account needed):
   - In the [Google Cloud console](https://console.cloud.google.com/security/recaptcha) for your Firebase project, create a **Website** key. Add your hosting domains (`<project-id>.web.app` and `<project-id>.firebaseapp.com`) and leave "Use checkbox challenge" off.
   - In the Firebase console, go to **Security > App Check > Apps**, choose your web app, pick **reCAPTCHA Enterprise** and paste the key.
   - Put the key in `.env` as `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`. It is a public site key, not a secret.
2. **Sign in and choose the project** (once):

   ```powershell
   npx firebase login
   npx firebase use --add
   ```

3. **Deploy:**

   ```powershell
   npm run deploy
   ```

   The app is then live at `https://<project-id>.web.app`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server on http://localhost:5173 |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |
| `npm run deploy` | Build and publish to Firebase Hosting |

## Project structure

```
src/
  ai/client.ts            Firebase AI Logic models, on-device availability, streaming
  ai/router.ts            Per-request on-device vs cloud decision
  ai/routerConfig.ts      Router thresholds
  ai/difficulty.ts        Simple or hard: judging a question from its wording
  ai/routeLog.ts          Recent routing decisions
  ai/queue.ts             Offline queue, saved on the device and sent on reconnect
  lib/useQueueFlusher.ts  Sends the queue when the browser comes back online
  ai/deviceSpeed.ts       One-off speed check of the on-device model
  lib/dataLedger.ts       Data saved and data used, kept on the device
  lib/useOnDeviceStartup.ts  Model warm-up and the background speed check
  lib/network.ts          Live connection quality from the browser
  ai/prompts.ts           Prompts sized for Gemini Nano's on-device limits
  ai/jobs.ts              AI requests in progress (kept alive across page turns)
  ai/summaries.ts         Page summaries
  ai/asks.ts              Questions about a page
  ai/quiz.ts              Quiz schema, parsing and validation
  ai/quizzes.ts           Writing and saving page quizzes
  ai/examFormat.ts        Exam types, schemas for written questions and marking, grades
  ai/exams.ts             Writing exams in batches, marking, explaining missed questions
  screens/Exam.tsx        Exam setup, the timed paper, marking and results
  components/PdfPage.tsx  Rendered page, selectable text layer and highlights
  components/PageToolbar.tsx  Hide the page list, zoom and enlarge
  lib/readerPrefs.ts      Zoom and page list choices, remembered on the device
  components/MarkToolbar.tsx     Highlighter colours, note and ask over a selection
  components/SummarySection.tsx  Summary on the study sheet, editable
  components/QuizSection.tsx     Quiz questions, marking and score
  components/AskSection.tsx      Ask about this page
  components/NotesSection.tsx    My notes and the page's highlights
  components/sheet.tsx    Ruled-sheet rows, answer badges, waiting state, Run AI on switch
  components/SheetTabs.tsx  Summary, Ask, Quiz and Notes tabs on the study sheet
  lib/sheetTab.ts         The open tab, and what is working or queued behind each one
  lib/pageText.ts         Header/footer removal and paragraph, heading and list rebuilding
  lib/symbols.ts          Repairs symbols PDFs store in old encodings (the empty boxes)
  components/RichText.tsx Formulas typeset with KaTeX, powers and bold in model text
  lib/highlights.ts       Turning a selection into page-relative highlight rectangles
  lib/runOn.ts            The student's Run AI on choice
  firebase.ts             Firebase app + App Check
  lib/pdf.ts              pdf.js loading, per-page text extraction, page and text layer rendering
  lib/importPdf.ts        Opening a PDF file into the on-device library
  lib/library.ts          IndexedDB storage: documents, page text, summaries, highlights, notes, answers
  screens/Library.tsx     Open a PDF, list documents on this device
  screens/Reader.tsx      Page view, page index and the study sheet
  screens/Diagnostics.tsx On-device vs cloud connection check
  index.css               Design tokens and the ruled-sheet styles
```

## Tech stack

Vite, React, TypeScript, Tailwind CSS, Firebase JS SDK (`firebase/ai`, App Check), pdf.js, KaTeX. Fonts (Archivo, Literata) are self-hosted from the build, and nothing loads from third-party CDNs.

## License

[Apache 2.0](LICENSE)
