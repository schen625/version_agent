import 'dotenv/config';
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import User from "./models/User.js";
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
  title: String,
  vocab: [
    {
      word: String,
      translation: String,
    }
  ],
  sentences: [
    {
      sentence: String,
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

async function generateSessionSummary(messages) {
  const convoText = messages
    .map(m => `${m.role}: ${m.original}`)
    .join("\n");

  const prompt = `return just JSON with this information
  {
  "title": "short summary of the conversation",
  "vocab": [
    { "word": "word", "translation": "meaning" }
  ],
  "sentences": [
    "sentences from conversation"
  ]
}

Criteria:
- I want 5 wvocab words
- I want 5 sentences and sentences must come straight form the conversation and relate to the 5 words

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
      vocab: [],
      sentences: []
    };
  }
}

app.post("/api/session/start", async (req, res) => {
  const { userId, mode } = req.body;
  const session = await Session.create({
    userId,
    mode,
    messages: []
  });

  res.json(session);
});

app.post("/api/session/end", async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const summary = await generateSessionSummary(session.messages);
    session.title = summary.title;
    session.vocab = summary.vocab;
    session.sentences = summary.sentences.map(s => ({ sentence: s }));
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

    const translatedUserMessage = translationRes.text.trim();
    const agentPrompt = `User said (in ${translateFrom}): "${message}". Respond naturally in ${translateTo}.`;
    const agentRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: agentPrompt }] }]
    });

    const agentReplyOriginal = agentRes.text.trim();
    const backTranslatePrompt = `Translate this from ${translateTo} to ${translateFrom}. Only output the translation. ${agentReplyOriginal}`;
    const backTranslateRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: backTranslatePrompt }] }]
    });
    const agentReplyTranslated = backTranslateRes.text.trim();

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

app.listen(3001, () => {
  console.log("Server running on port 3001");
});