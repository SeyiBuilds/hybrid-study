# Hybrid Study

A study companion for students with patchy, expensive internet. Open a lecture PDF and get summaries, quizzes and explanations from AI that **runs on your laptop when it can and in the cloud when it must**. A router picks where each request runs, based on the network, how hard the task is and how fast your device is, so the app keeps working offline and only spends data when it's worth it.

Built for the [#BuildHybridAI 2026 hackathon](https://firebasehybridaihackathon.devpost.com/) with [Firebase AI Logic](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference) hybrid inference (Gemini Nano in Chrome + Gemini in the cloud).

> **Status:** in active development. Working now: open a lecture PDF, read it page by page with the extracted text beside each page, and reopen it later offline. Summaries and quizzes are next. See [BUILD_LOG.md](BUILD_LOG.md) for progress.

## Features

- **PDF reader.** Open or drop a PDF. Each page is shown next to the exact text the AI will read. Pages that are scanned images are flagged.
- **Kept on your device.** Documents are stored in the browser (IndexedDB), reopen offline, and remember the page you were on. Nothing is uploaded when you open a file.
- **Connection details.** A built-in check sends the same question to Gemini Nano in Chrome and to Gemini in the cloud, showing where each answer ran and how long it took.

## How Firebase AI Logic is used

- `src/ai/client.ts` creates two Firebase AI Logic models with the Gemini Developer API backend: one pinned to `InferenceMode.ONLY_ON_DEVICE` (Gemini Nano through Chrome's Prompt API) and one pinned to `InferenceMode.ONLY_IN_CLOUD`. Responses are streamed, and `response.inferenceSource` confirms where each answer ran.
- `src/ai/router.ts` is the single entry point for generation. It decides per request which model to use and returns a short reason string.
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

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server on http://localhost:5173 |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |

## Project structure

```
src/
  ai/client.ts            Firebase AI Logic models, on-device availability, streaming
  ai/router.ts            Per-request on-device vs cloud decision
  firebase.ts             Firebase app + App Check
  lib/pdf.ts              pdf.js loading, per-page text extraction, page rendering
  lib/importPdf.ts        Opening a PDF file into the on-device library
  lib/library.ts          IndexedDB storage for documents and their page text
  screens/Library.tsx     Open a PDF, list documents on this device
  screens/Reader.tsx      Page view, page index and extracted text
  screens/Diagnostics.tsx On-device vs cloud connection check
  index.css               Design tokens and the ruled-sheet styles
```

## Tech stack

Vite, React, TypeScript, Tailwind CSS, Firebase JS SDK (`firebase/ai`, App Check), pdf.js. Fonts (Archivo, Literata) are self-hosted from the build, and nothing loads from third-party CDNs.

## License

[Apache 2.0](LICENSE)
