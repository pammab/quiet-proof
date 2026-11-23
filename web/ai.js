// Hybrid AI layer: Firebase AI Logic with Gemini Nano on device and Gemini in the cloud.
//
// Rules this module enforces:
// - Documents (receipts, statements, contracts, emails) are read ON DEVICE only.
//   If the on-device model is not ready, nothing is sent to the cloud unless the
//   user approves the exact payload first (the "privacy receipt").
// - The cloud model only receives anonymized totals (plans, explanations, letters).
// - Every answer is validated by code; the AI never computes money amounts.
// - Every call is logged with where it ran (inferenceSource), for the privacy
//   counter shown to the user and the cost panel shown to developers.

// TODO(setup): confirm the SDK version from the Firebase console snippet (needs >= 12.5).
const FIREBASE_VERSION = "12.5.0";
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

import { firebaseConfig, appCheckSiteKey } from "./firebase-config.js";

const { initializeApp } = await import(`${CDN}/firebase-app.js`);
const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import(`${CDN}/firebase-app-check.js`);
const { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } = await import(`${CDN}/firebase-ai.js`);

const app = initializeApp(firebaseConfig);

// App Check is required by Firebase AI Logic. On localhost we use a debug token.
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
  isTokenAutoRefreshEnabled: true,
});

const ai = getAI(app, { backend: new GoogleAIBackend() });

// Documents: on device only. The app catches the error and asks the user before
// using `cloudReader` with an anonymized version of the content.
const deviceReader = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    createOptions: {
      expectedInputs: [{ type: "text", languages: ["en"] }, { type: "image" }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    },
  },
});

// Short drafts (reminders, labels): prefer device, fall back to cloud.
const drafter = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE });

// Plans and explanations from anonymized totals: cloud.
const planner = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD });

// ---------- model readiness ----------
let deviceState = "unknown"; // unknown | downloading | ready | unavailable
const listeners = new Set();
export const onDeviceState = (fn) => (listeners.add(fn), fn(deviceState));
const setState = (s, extra) => { deviceState = s; listeners.forEach((fn) => fn(s, extra)); };

// Must be called from a user gesture (button click), per the Chrome Prompt API.
export async function prepareDeviceModel() {
  try {
    setState("downloading", 0);
    await deviceReader.initializeDeviceModel((p) => setState("downloading", p));
    setState("ready");
  } catch (e) {
    setState("unavailable", e?.message);
  }
  return deviceState;
}
export const deviceReady = () => deviceState === "ready";

// ---------- log for the privacy counter and the cost panel ----------
const log = [];
export const callLog = () => [...log];
function record(task, response, sentToCloud) {
  const source = response?.inferenceSource || (sentToCloud ? "IN_CLOUD" : "ON_DEVICE");
  log.push({ task, source, at: new Date().toISOString(), sentToCloud: sentToCloud || null });
  return source;
}

// ---------- helpers ----------
const parseJSON = (text) => {
  const t = String(text || "").replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(t);
};

/**
 * Read a document on device and return validated JSON.
 * @param {object} p
 * @param {string} p.task       label for the log, e.g. "receipt"
 * @param {string} p.prompt     instructions + JSON shape
 * @param {Array}  p.parts      extra parts, e.g. [{ inlineData: { mimeType, data } }]
 * @param {(obj) => string[]} p.validate  returns a list of problems ([] = ok)
 * @param {number} [p.tries=2]
 * @returns {{ ok: boolean, data?: object, problems?: string[], source?: string, needsConsent?: boolean }}
 */
export async function readOnDevice({ task, prompt, parts = [], validate, tries = 2 }) {
  if (!deviceReady()) return { ok: false, needsConsent: true, problems: ["on-device model not ready"] };
  let problems = [];
  for (let i = 0; i < tries; i++) {
    try {
      const fix = problems.length ? `\nYour last answer had problems: ${problems.join("; ")}. Return valid JSON only.` : "";
      const res = await deviceReader.generateContent([prompt + fix, ...parts]);
      const data = parseJSON(res.response.text());
      problems = validate ? validate(data) : [];
      const source = record(task, res.response);
      if (!problems.length) return { ok: true, data, source };
    } catch (e) {
      problems = [e?.message || "could not read"];
    }
  }
  return { ok: false, problems, needsConsent: true };
}

/** Short text draft; may run on device or in the cloud (no private documents here). */
export async function draft(task, prompt) {
  const res = await drafter.generateContent(prompt);
  const source = record(task, res.response);
  return { text: res.response.text().trim(), source };
}

/**
 * Cloud call with a payload the user has already approved.
 * `approvedPayload` is exactly what was shown in the privacy receipt.
 */
export async function planInCloud(task, instructions, approvedPayload) {
  const res = await planner.generateContent(`${instructions}\n\nDATA (anonymized, approved by the user):\n${JSON.stringify(approvedPayload)}`);
  record(task, res.response, approvedPayload);
  return res.response.text().trim();
}
