import 'dotenv/config';
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import buildPipeline from "./agents/buildPipeline.js";
import Session from "./models/Sessions.js"
import client from "./geminiClient.js";
import UserWordStat from "./models/WordStats.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", authRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

async function generateSessionSummary(messages) {
  const convoText = messages
    .map(m => `${m.role}: ${m.original}`)
    .join("\n");

  const prompt = `return just JSON with this information:
    {
      "title": "short summary title (2-4 words)",
      "summary": "1 sentence summary",
      "vocab": [
        { "word": "word", "translation": "meaning" }
      ],
      "sentences": [
        {
          "sentence": "sentence from conversation",
          "translation": "translation of sentence"
        }
      ]
    }

    RULES:
    - I want 5 vocab words
    - I want 5 sentences
    - sentences MUST come from conversation
    - each sentence MUST have translation

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
      return res.status(404).json({
        error: "Session not found"
      });
    }

    //creates learning materials
    const learningContent =
      await buildPipeline(session.messages);

    //creates summary
    const summaryContent =
      await generateSessionSummary(session.messages);

    session.title = summaryContent.title;
    session.summary = summaryContent.summary;
    session.sentences = summaryContent.sentences;
    session.vocab = learningContent.vocabulary;
    session.questionPool = learningContent.questionPool;
    session.learnQuestions = learningContent.learnQuestions;
    session.testQuestions = learningContent.testQuestions;

    session.endedAt = new Date();
    await session.save();
    res.json(session);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});

app.post("/api/word-stat/update", async (req, res) => {
  const { userId, word, isCorrect } = req.body;

  try {
    await UserWordStat.findOneAndUpdate(
      { userId, word },
      {
        $inc: {
          correct: isCorrect ? 1 : 0,
          wrong: !isCorrect ? 1 : 0
        },
        $set: { lastSeen: new Date() }
      },
      { upsert: true, new: true }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/session/message", async (req, res) => {
  const {
    sessionId,
    message,
    translateFrom,
    translateTo,
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

    const historyText = session.messages
      .slice(-10) // last 10 messages (important for token control)
      .map(m => `${m.role === "user" ? "User" : "Agent"}: ${m.original}`)
      .join("\n");

    const translatedUserMessage = translationRes.text.trim();
    const agentPrompt = `
      You are a casual conversation partner helping someone practice a language, use conversation history for context.

      RULES:
      - Respond with ONLY ONE message
      - Do NOT give multiple options
      - Do NOT use bullet points
      - Do NOT explain your answer
      - Do NOT correct grammar unless asked
      - Do NOT include notes or meta comments
      - Keep it natural and conversational
      - Keep it to 1-2 sentences MAX
      - Always continue the conversation

      - Absolutely NEVER output lists, bullet points, or multiple versions
      - If you feel multiple answers are possible, choose the BEST single one

      Format:
      One short paragraph only.
      No formatting.
      No markdown.

      Conversation history:
      ${historyText}
      
      User said (in ${translateFrom}):
      "${message}"

      Respond in ${translateTo}.
      `;

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