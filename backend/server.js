import 'dotenv/config';
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import WordStat from "./models/WordStat.js";
import { GoogleGenAI } from "@google/genai";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", authRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

const sessionSchema = new mongoose.Schema({
  userId: String,
  mode: String,
  // The target language being practiced (translateTo, e.g. "zh"). Persisted so
  // Review can scope to same-language sessions and old words from a different
  // language don't leak in. Sessions created before this field rely on a
  // script-detection fallback in the frontend (see learnReview.sessionLangKey).
  language: String,
  title: String,
  summary: String,
  vocab: [
    {
      word: String,
      translation: String,
    }
  ],
  sentences: [
    {
      sentence: String,
      translation: String,
    }
  ],
  createdAt: { type: Date, default: Date.now },
  endedAt: Date,

  messages: [
    {
      role: String,
      original: String,
      translated: String,
      timestamp: { type: Date, default: Date.now }
    }
  ]
});

const Session = mongoose.model("Session", sessionSchema);

const client = new GoogleGenAI({
  apiKey: process.env.API_KEY,
  apiVersion: "v1alpha"
});

// Strip em/en dashes so TTS pauses naturally. Replace with comma+space to
// preserve a real pause where the dash was, then dedupe runs of punctuation.
function sanitizeAgentText(raw) {
  if (!raw) return "";
  let text = String(raw).trim();
  text = text.replace(/^["']|["']$/g, "");
  // Em-dash / en-dash with optional surrounding spaces -> comma + space
  text = text.replace(/\s*[—–]\s*/g, ", ");
  // Collapse accidental ", ," or ",." sequences
  text = text.replace(/,\s*,/g, ",");
  text = text.replace(/,\s*\./g, ".");
  // Collapse multiple spaces
  text = text.replace(/[ \t]{2,}/g, " ");
  return text.trim();
}

async function generateSessionSummary(messages) {
  const convoText = messages
    .map(m => `${m.role}: ${m.original}`)
    .join("\n");

  const prompt = `Return ONLY JSON (no markdown, no commentary) in exactly this shape:
{
  "title": "short summary title (2-4 words)",
  "summary": "1 sentence summary",
  "vocab": [
    { "word": "word in the language being practiced", "translation": "meaning in the user's other language" }
  ],
  "sentences": [
    { "sentence": "example sentence that contains the matching vocab word", "translation": "translation of the sentence" }
  ]
}

Criteria:
- Provide EXACTLY 4 vocab words that appeared in the conversation (the most useful / teachable ones).
- Provide EXACTLY 4 sentences. The "sentences" array MUST be aligned one-to-one with "vocab" by position: sentences[i] is the example for vocab[i].
- CRITICAL: sentences[i] MUST contain the exact text of vocab[i].word verbatim, so it can be turned into a fill-in-the-blank where vocab[i].word is the missing answer.
- Each sentence should be a short, natural, beginner-friendly variation INSPIRED BY the conversation (it does NOT need to be copied word-for-word), written in the SAME language as vocab[i].word.
- Every sentence MUST include its translation in the user's other language.
- Do NOT include any vocab word that you cannot place verbatim into its matching sentence.

Conversation:
${convoText}
`;

  const res = await client.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  //in case JSON error 
  let text = res.text.trim();
  text = text.replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("Json error", text);

    return {
      title: "Conversation Practice",
      summary: "No summary available",
      vocab: [],
      sentences: []
    };
  }
}

function normalizeSessionSummary(summary) {
  const rawVocab = Array.isArray(summary?.vocab) ? summary.vocab : [];
  const rawSentences = Array.isArray(summary?.sentences) ? summary.sentences : [];
  const seen = new Set();
  const vocab = [];
  const sentences = [];

  rawVocab.forEach((v, i) => {
    const word = typeof v?.word === "string" ? v.word.trim() : "";
    if (!word || seen.has(word)) return;
    seen.add(word);

    const sentence = rawSentences[i] || {};
    vocab.push({
      word,
      translation: typeof v?.translation === "string" ? v.translation.trim() : "",
    });
    sentences.push({
      sentence: typeof sentence.sentence === "string" ? sentence.sentence.trim() : "",
      translation: typeof sentence.translation === "string" ? sentence.translation.trim() : "",
    });
  });

  return {
    title: typeof summary?.title === "string" ? summary.title : "Conversation Practice",
    summary: typeof summary?.summary === "string" ? summary.summary : "No summary available",
    vocab,
    sentences,
  };
}

async function generateAgentOpening(translateFrom, translateTo) {
  const topicPool = [
    "Introducing yourself",
    "Your family",
    "Your school or work",
    "Your daily routine",
    "Your hobbies",
    "Your favorite food",
    "Ordering food at a restaurant",
    "Shopping for clothes",
    "Asking for directions",
    "Travel plans",
    "Describing your room or house",
    "Talking about the weather",
    "Weekend plans",
    "Sports you like",
    "Music, movies, or shows",
    "Your favorite place",
    "A recent trip",
    "Health and feeling sick",
    "Making plans with a friend",
    "Talking about goals and dreams",
    "Describing a photo",
    "Comparing two things",
    "Giving opinions",
    "Telling a short story",
    "Solving a small problem, like losing something"
  ];
  const shuffled = [...topicPool].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 2 + Math.floor(Math.random() * 2)); // 2 or 3 topics
  const seed = Math.floor(Math.random() * 1000000);

  const openingPrompt = `You are a warm, friendly conversation partner helping someone practice ${translateTo}.

This is the very first message of a brand new conversation — YOU are starting it. Write an opening that:
1. Warmly greets the user (something inviting, not stiff)
2. Suggests A FEW (2 or 3) beginner-friendly everyday topic ideas the user could chat about, framed naturally — not as a bullet list, but woven into a sentence (e.g. "tell me about X, or Y, or even Z")
3. Clearly but briefly reassures the user that the suggestion is JUST a suggestion and they're welcome to talk about absolutely anything they'd like

Tone reference. Your output should feel as warm and inviting as this example (do NOT copy it; match the warmth):
"Hi! Let's start with something simple: tell me about one thing you did today, or one thing you're planning to do later. This is just a suggestion, so you can talk about anything you'd like."

For variety this session, build your suggestion around these topic ideas: ${picked.join("; ")}.
Variation seed: ${seed}

Rules:
- Write ONLY in ${translateTo}
- 2 to 3 short sentences total. Warm and welcoming, not long-winded
- Sound natural, casual, and friendly (like a friend, not a teacher)
- Frame the topic ideas as concrete, easy invitations (for example "tell me about…", "you could share…", "we could chat about…"), not as a labeled list
- IMPORTANT: Do NOT use em-dashes (—) or en-dashes (–) anywhere. They sound unnatural when read aloud. Use commas, periods, colons, or the word "and" instead, so the sentence pauses naturally
- No markdown, no bullets, no numbered lists, no quotes around the message, no meta-commentary
- Output ONLY the greeting message itself, nothing else`;

  let agentReplyOriginal;
  try {
    const openingRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: openingPrompt }] }],
      config: { temperature: 1.2, topP: 0.95 }
    });
    agentReplyOriginal = sanitizeAgentText(openingRes.text);
  } catch (err) {
    console.error("Agent opening generation failed:", err);
    agentReplyOriginal = "Hi! Let's start with something simple. Tell me about your day, your hobbies, or your favorite food. This is just a suggestion, so feel free to talk about anything you'd like.";
  }

  let agentReplyTranslated = "";
  try {
    const backTranslatePrompt = `Translate this from ${translateTo} to ${translateFrom}. Only output the translation. Do not use em-dashes (—) or en-dashes (–); use commas, periods, or "and" instead. ${agentReplyOriginal}`;
    const backTranslateRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: backTranslatePrompt }] }]
    });
    agentReplyTranslated = sanitizeAgentText(backTranslateRes.text);
  } catch (err) {
    console.error("Opening back-translate failed:", err);
  }

  return { original: agentReplyOriginal, translated: agentReplyTranslated };
}

async function generateAgentNudge(translateFrom, translateTo) {
  // Reuse the same topic vocabulary as the opening so nudges feel consistent
  const topicPool = [
    "Introducing yourself", "Your family", "Your school or work",
    "Your daily routine", "Your hobbies", "Your favorite food",
    "Ordering food at a restaurant", "Shopping for clothes",
    "Asking for directions", "Travel plans", "Describing your room or house",
    "Talking about the weather", "Weekend plans", "Sports you like",
    "Music, movies, or shows", "Your favorite place", "A recent trip",
    "Health and feeling sick", "Making plans with a friend",
    "Talking about goals and dreams", "Describing a photo",
    "Comparing two things", "Giving opinions", "Telling a short story",
    "Solving a small problem, like losing something"
  ];
  const picked = topicPool[Math.floor(Math.random() * topicPool.length)];
  const seed = Math.floor(Math.random() * 1000000);

  const nudgePrompt = `You are a warm, patient conversation partner helping someone practice ${translateTo}.

The user has been quiet for about 30 seconds. Write a gentle, kind follow-up message that:
- Acknowledges they may still be thinking, no pressure
- Gently invites them to share something, OR offers ONE fresh topic idea they could chat about
- Reminds them (briefly) that they can talk about anything they'd like

Tone reference (do NOT copy, just match the warmth):
"No rush! Whenever you're ready, you could tell me about your favorite place to relax. Of course, feel free to share anything else on your mind."

For this nudge, lean toward this topic idea: ${picked}.
Variation seed: ${seed}

Rules:
- Write ONLY in ${translateTo}
- 1 to 2 short sentences total, gentle and friendly, never pushy or impatient
- Sound caring, like a friend checking in
- Do NOT use em-dashes (—) or en-dashes (–). Use commas, periods, colons, or "and" so it reads aloud naturally
- No markdown, no bullets, no quotes around the message, no meta-commentary
- Output ONLY the message itself`;

  let agentReplyOriginal;
  try {
    const nudgeRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: nudgePrompt }] }],
      config: { temperature: 1.2, topP: 0.95 }
    });
    agentReplyOriginal = sanitizeAgentText(nudgeRes.text);
  } catch (err) {
    console.error("Agent nudge generation failed:", err);
    agentReplyOriginal = "No rush! Whenever you're ready, you could tell me about your day or anything else on your mind.";
  }

  let agentReplyTranslated = "";
  try {
    const backTranslatePrompt = `Translate this from ${translateTo} to ${translateFrom}. Only output the translation. Do not use em-dashes (—) or en-dashes (–); use commas, periods, or "and" instead. ${agentReplyOriginal}`;
    const backTranslateRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: backTranslatePrompt }] }]
    });
    agentReplyTranslated = sanitizeAgentText(backTranslateRes.text);
  } catch (err) {
    console.error("Nudge back-translate failed:", err);
  }

  return { original: agentReplyOriginal, translated: agentReplyTranslated };
}

app.post("/api/session/nudge", async (req, res) => {
  try {
    const { sessionId, translateFrom, translateTo } = req.body;
    if (!sessionId || !translateFrom || !translateTo) {
      return res.status(400).json({ error: "Missing sessionId or languages" });
    }

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const agent = await generateAgentNudge(translateFrom, translateTo);
    session.messages.push({
      role: "agent",
      original: agent.original,
      translated: agent.translated
    });
    await session.save();

    res.json({ agent });
  } catch (err) {
    console.error("SESSION NUDGE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/session/start", async (req, res) => {
  try {
    const { userId, mode, translateFrom, translateTo } = req.body;
    const session = await Session.create({
      userId,
      mode,
      language: translateTo,
      messages: []
    });

    let agent = null;
    if (translateFrom && translateTo) {
      agent = await generateAgentOpening(translateFrom, translateTo);
      session.messages.push({
        role: "agent",
        original: agent.original,
        translated: agent.translated
      });
      await session.save();
    }

    res.json({
      _id: session._id,
      userId: session.userId,
      mode: session.mode,
      messages: session.messages,
      agent
    });
  } catch (err) {
    console.error("SESSION START ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/session/end", async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const summary = normalizeSessionSummary(await generateSessionSummary(session.messages));
    session.title = summary.title;
    session.summary = summary.summary;
    session.vocab = summary.vocab;
    session.sentences = summary.sentences;
    session.endedAt = new Date();

    await session.save();

    res.json(session);

  } catch (err) {
    console.error("SESSION END ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/session/message", async (req, res) => {
  const {
    sessionId,
    message,
    translateFrom,
    translateTo,
    mode
  } = req.body;

  try {
    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const translatePrompt = `Translate this from ${translateFrom} to ${translateTo}. Only output the translation. ${message}`;
    const translationRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: translatePrompt }] }]
    });

    const translatedUserMessage = sanitizeAgentText(translationRes.text);
    const agentPrompt = `
    You are a casual conversation partner helping someone practice a language.

    CRITICAL RULES:
    - Respond with ONLY ONE message
    - Do NOT give multiple options
    - Do NOT use bullet points
    - Do NOT explain your answer
    - Do NOT correct grammar unless asked
    - Do NOT include notes or meta comments
    - Keep it natural and conversational
    - Keep it to one paragraph MAX
    - Always continue the conversation

    - Absolutely NEVER output lists, bullet points, or multiple versions
    - If you feel multiple answers are possible, choose the BEST single one
    - IMPORTANT: Do NOT use em-dashes (—) or en-dashes (–). They sound unnatural when read aloud. Use commas, periods, colons, or the word "and" so the sentence pauses naturally.

    Format:
    One short paragraph only.
    No formatting.
    No markdown.

    User said (in ${translateFrom}):
    "${message}"

    Respond in ${translateTo}.
    `;
    const agentRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: agentPrompt }] }]
    });

    const agentReplyOriginal = sanitizeAgentText(agentRes.text);
    const backTranslatePrompt = `Translate this from ${translateTo} to ${translateFrom}. Only output the translation. Do not use em-dashes (—) or en-dashes (–); use commas, periods, or "and" instead. ${agentReplyOriginal}`;
    const backTranslateRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: backTranslatePrompt }] }]
    });
    const agentReplyTranslated = sanitizeAgentText(backTranslateRes.text);

    session.messages.push(
      {
        role: "user",
        original: message,
        translated: translatedUserMessage
      },
      {
        role: "agent",
        original: agentReplyOriginal,
        translated: agentReplyTranslated
      }
    );

    await session.save();

    res.json({
      user: {
        original: message,
        translated: translatedUserMessage
      },
      agent: {
        original: agentReplyOriginal,
        translated: agentReplyTranslated
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/session/:sessionId", async (req, res) => {
  const session = await Session.findById(req.params.sessionId);
  res.json(session);
});

app.get("/api/user/:userId/sessions", async (req, res) => {
  const sessions = await Session.find({ userId: req.params.userId });
  res.json(sessions);
});

// Return every word-stat document for a user. The frontend turns these into
// per-word error rates when choosing Review words.
app.get("/api/user/:userId/word-stats", async (req, res) => {
  try {
    const stats = await WordStat.find({ userId: req.params.userId });
    res.json(stats);
  } catch (err) {
    console.error("WORD STATS FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// Record one or more practice attempts. Body can be either a single
// { word, translation, correct } or { updates: [{ word, translation, correct }] }.
// Each attempt increments `attempts`, and a wrong answer also increments `errors`.
app.post("/api/user/:userId/word-stats", async (req, res) => {
  try {
    const { userId } = req.params;
    let updates = Array.isArray(req.body.updates) ? req.body.updates : null;
    if (!updates) {
      updates = [{
        word: req.body.word,
        translation: req.body.translation,
        correct: req.body.correct,
      }];
    }

    const ops = updates
      .filter(u => u && u.word)
      .map(u => ({
        updateOne: {
          filter: { userId, word: u.word },
          update: {
            $setOnInsert: { userId, word: u.word },
            $set: { translation: u.translation, updatedAt: new Date() },
            $inc: { attempts: 1, errors: u.correct ? 0 : 1 },
          },
          upsert: true,
        },
      }));

    if (ops.length) await WordStat.bulkWrite(ops);
    res.json({ ok: true, updated: ops.length });
  } catch (err) {
    console.error("WORD STATS UPDATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log("Server running on port 3001");
});
