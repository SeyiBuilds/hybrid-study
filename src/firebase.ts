import { initializeApp } from 'firebase/app'
import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** Names of config values missing from .env, so the UI can say what to fix. */
export const missingConfigKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key)

export const app = initializeApp(firebaseConfig)

export type AppCheckMode = 'debug' | 'recaptcha-enterprise' | 'off'

function startAppCheck(): { mode: AppCheckMode; instance: AppCheck | null } {
  const siteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY

  if (import.meta.env.DEV) {
    // Debug provider: the SDK prints a debug token to the console on first run.
    // Register it in Firebase console > App Check > Apps > Manage debug tokens.
    // The token lives in this browser's storage and is never committed.
    const scope = self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }
    scope.FIREBASE_APPCHECK_DEBUG_TOKEN = true

    // In debug mode the SDK swaps in the debug token and never calls the
    // provider, so a no-op provider avoids loading the reCAPTCHA script locally.
    const instance = initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: () => Promise.reject(new Error('Debug mode: provider not used')),
      }),
      isTokenAutoRefreshEnabled: true,
    })
    return { mode: 'debug', instance }
  }

  if (siteKey) {
    const instance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
    return { mode: 'recaptcha-enterprise', instance }
  }

  console.error(
    'App Check is not configured for this build. Set VITE_RECAPTCHA_ENTERPRISE_SITE_KEY; cloud AI calls will be rejected while App Check is enforced.',
  )
  return { mode: 'off', instance: null }
}

const appCheck = startAppCheck()
export const appCheckMode = appCheck.mode
