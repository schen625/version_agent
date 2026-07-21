// backend/pipeline/geminiClient.js
//
// Production LLM adapter: wraps @google/genai into the plain
// (prompt: string) => Promise<string> function the orchestrator expects, with a
// throttle + 429/503 retry layer (see rateLimit.js) so the pipeline survives
// Gemini free-tier rate limits.
//
// Env knobs:
//   PIPELINE_MODEL            model name (default gemini-3.1-flash-lite-preview)
//   PIPELINE_MIN_INTERVAL_MS  spacing between calls (default 4500 ≈ 13 rpm)
//   PIPELINE_LLM_RETRIES      retries on 429/503 (default 5)

import { GoogleGenAI } from "@google/genai";
import { createThrottledRetry } from "./rateLimit.js";

export const createGeminiLLM = ({
  apiKey = process.env.API_KEY,
  model = process.env.PIPELINE_MODEL || "gemini-3.1-flash-lite-preview",
  apiVersion = "v1alpha",
  config,
  minIntervalMs = Number(process.env.PIPELINE_MIN_INTERVAL_MS ?? 4500),
  maxRetries = Number(process.env.PIPELINE_LLM_RETRIES ?? 5),
} = {}) => {
  if (!apiKey) {
    throw new Error("createGeminiLLM: missing apiKey (set API_KEY in the environment).");
  }
  const client = new GoogleGenAI({ apiKey, apiVersion });
  const run = createThrottledRetry({ minIntervalMs, maxRetries });

  return async function geminiLLM(prompt) {
    return run(async () => {
      const res = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: String(prompt) }] }],
        ...(config ? { config } : {}),
      });
      return typeof res?.text === "string" ? res.text : res?.text ?? "";
    });
  };
};

export default createGeminiLLM;
