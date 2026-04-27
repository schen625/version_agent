import 'dotenv/config';
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import mongoose from "mongoose";

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

const messageSchema = new mongoose.Schema({
  userId: String,
  role: String,
  original: String,
  translated: String,
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);

const client = new GoogleGenAI({
  apiKey: process.env.API_KEY,
  apiVersion: "v1alpha"
});

app.post("/api/chat", async (req, res) => {
  const { message, translateFrom, translateTo, userId } = req.body;

  try {
    const translatePrompt = `Translate this from ${translateFrom} to ${translateTo}. Only output the translation. ${message}`;

    const translationRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: translatePrompt }] }]
    });

    const translatedUserMessage = translationRes.text;

    const agentPrompt = `User said (in ${translateFrom}): "${message}". Respond naturally in ${translateTo}.`;

    const agentRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: agentPrompt }] }]
    });

    const agentReplyOriginal = agentRes.text;

    const agentTranslatePrompt = `Translate this from ${translateTo} to ${translateFrom}. Only output the translation. ${agentReplyOriginal}`;

    const agentTranslateRes = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: agentTranslatePrompt }] }]
    });

    const agentReplyTranslated = agentTranslateRes.text;

    await Message.create([
      {
        userId,
        role: "user",
        original: message,
        translated: translatedUserMessage
      },
      {
        userId,
        role: "agent",
        original: agentReplyOriginal,
        translated: agentReplyTranslated
      }
    ]);

    res.json({
      translatedUserMessage,
      agentReplyOriginal,
      agentReplyTranslated
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/chat/:userId", async (req, res) => {
  try {
    const messages = await Message.find({ userId: req.params.userId })
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log("Server running on port 3001");
});