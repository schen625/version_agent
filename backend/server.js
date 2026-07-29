import 'dotenv/config';
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import buildPipeline from "./agents/buildPipeline.js";
import Session from "./models/Sessions.js"
import client from "./geminiClient.js";
import UserWordStat from "./models/WordStats.js";
import {
  contextQuestionPrompt,
  outOfContextQuestionPrompt,
  parseModelJson,
  normalizeQuestions
} from "./pipeline/index.js";

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

  // allows agent to initiate conversation
    const isStartConversation = message === "__START_CONVERSATION__";
    const isFollowUp = message === "__FOLLOW_UP__";

  try {
    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    let translatedUserMessage = null;

    if (!isStartConversation && !isFollowUp) {
      const translatePrompt = `Translate this from ${translateFrom} to ${translateTo}. Only output the translation. ${message}`;

      const translationRes = await client.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: [{ role: "user", parts: [{ text: translatePrompt }] }]
      });

      translatedUserMessage = translationRes.text.trim();
    }

    const historyText = session.messages
      .slice(-10)
      .map(m => `${m.role === "user" ? "User" : "Agent"}: ${m.original}`)
      .join("\n");

    const agentPrompt = isStartConversation
      ? `
    You are a casual conversation partner helping someone practice a language.

    Start the conversation first.

    CRITICAL RULES:
    - Respond with ONLY ONE message
    - Ask one simple, friendly question
    - Do NOT give multiple options
    - Do NOT use bullet points
    - Do NOT explain your answer
    - Keep it natural and conversational
    - Keep it to one short paragraph
    - Respond in ${translateTo}

    Format:
    One short paragraph only.
    No formatting.
    No markdown.
    `
      : isFollowUp
        ? `
    You are a casual conversation partner helping someone practice a language.

    The user has not responded yet. Send a gentle follow-up message to keep the conversation going.

    Conversation history:
    ${historyText}

    CRITICAL RULES:
    - Respond with ONLY ONE message
    - Ask one simple follow-up question
    - Do NOT sound annoyed
    - Do NOT give multiple options
    - Do NOT use bullet points
    - Do NOT explain your answer
    - Keep it natural and conversational
    - Keep it to one short paragraph
    - Respond in ${translateTo}

    Format:
    One short paragraph only.
    No formatting.
    No markdown.
    `
        : `
    You are a casual conversation partner helping someone practice a language.

    Conversation history:
    ${historyText}

    User's latest message:
    ${translatedUserMessage}

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

    if (isStartConversation || isFollowUp) {
      session.messages.push({
        role: "agent",
        original: agentReplyOriginal,
        translated: agentReplyTranslated
      });
    } else {
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
    }

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

app.post("/api/assessment/generate", async (req, res) => {
  try {
    const { sessionId, learningLanguage = "zh", knownLanguage = "en" } = req.body;

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const conversation = session.messages
      .map(m => `${m.role}: ${m.original}`)
      .join("\n");

    const learnedWords = session.vocab || [];

    const outOfContextFamiliar = [];

    for (const vocab of learnedWords) {
      const prompt = outOfContextQuestionPrompt({
        mode: "familiar",
        word: vocab.word,
        translation: vocab.translation,
        count: 2,
        learningLanguage,
        knownLanguage
      });

      const result = await client.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });

      const parsed = parseModelJson(result.text);
      const questions = normalizeQuestions(parsed).filter(q => q.valid);

      outOfContextFamiliar.push(
        ...questions.map(q => ({
          ...q,
          condition: "out_of_context_familiar",
          type: "fill_blank",
          word: vocab.word
        }))
      );
    }

    res.json({
      fillBlankQuestions: outOfContextFamiliar
    });

  } catch (err) {
    console.error("ASSESSMENT GENERATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log("Server running on port 3001");
});