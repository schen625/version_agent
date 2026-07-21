// backend/pipeline/rateLimit.js
//
// Throttle + retry for the LLM client. Gemini's free tier caps requests/minute
// (e.g. 15 rpm), and the pipeline makes many calls, so without pacing the run
// dies with 429 RESOURCE_EXHAUSTED. This wraps any async call with:
//   (a) a shared throttle that spaces calls >= minIntervalMs apart, and
//   (b) retry on 429 / 503, honoring the server's suggested retryDelay.
// Pure and injectable (sleepFn) so it's testable without real timers/network.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pull the server-suggested retry delay (seconds -> ms) out of a Gemini error.
export const parseRetryDelayMs = (err, fallbackMs) => {
  let hay = typeof err?.message === "string" ? err.message : "";
  try { hay += " " + JSON.stringify(err); } catch { /* ignore */ }
  const m = hay.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/i) || hay.match(/retry in ([\d.]+)s/i);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 250; // small cushion
  return fallbackMs;
};

export const isRetriableError = (err) => {
  const code = err?.code ?? err?.status ?? err?.error?.code;
  const hay = `${err?.status ?? ""} ${err?.message ?? ""} ${err?.error?.status ?? ""}`;
  return code === 429 || code === 503 || /\b429\b|\b503\b|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(hay);
};

export const createThrottledRetry = ({
  minIntervalMs = 4500, // ~13 req/min, safely under a 15 rpm free tier
  maxRetries = 5,
  maxBackoffMs = 60000,
  isRetriable = isRetriableError,
  retryDelay = parseRetryDelayMs,
  sleepFn = sleep,
} = {}) => {
  let gate = Promise.resolve(); // async mutex so spacing is honored across calls
  let lastAt = 0;
  const acquire = () => {
    const prev = gate;
    let release;
    gate = new Promise((r) => (release = r));
    return prev.then(async () => {
      const wait = Math.max(0, lastAt + minIntervalMs - Date.now());
      if (wait) await sleepFn(wait);
      lastAt = Date.now();
      release();
    });
  };

  return async function run(fn) {
    for (let attempt = 0; ; attempt++) {
      await acquire();
      try {
        return await fn();
      } catch (err) {
        if (isRetriable(err) && attempt < maxRetries) {
          await sleepFn(retryDelay(err, Math.min(maxBackoffMs, 1000 * 2 ** attempt)));
          continue;
        }
        throw err;
      }
    }
  };
};
