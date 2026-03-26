import 'dotenv/config';
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(cors());
app.use(express.json());

const client = new GoogleGenAI({
  apiKey: process.env.API_KEY,
  apiVersion: "v1alpha"
});

let conversationHistory = [];

app.post("/api/chat", async (req, res) => {
  const { message, targetLang } = req.body;

  try {
    const prompt = `Translate this to ${targetLang} and dont add anything:\n${message}`;

    conversationHistory.push({
      role: "user",
      parts: [{ text: prompt }]
    });

    const response = await client.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: conversationHistory
    });

    const replyText = response.text;

    conversationHistory.push({
      role: "model",
      parts: [{ text: replyText }]
    });

    res.json({
      translatedUserMessage: replyText,
      agentReply: replyText
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("Server running on port 3001"));