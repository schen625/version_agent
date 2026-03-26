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

app.post("/api/chat", async (req, res) => {
    const { message, translateFrom, translateTo } = req.body;

    try {
        // translate to users language
        const translatePrompt = `Translate this from ${translateFrom} to ${translateTo}. Only output the translation. ${message}`;

        const translationRes = await client.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: [{ role: "user", parts: [{ text: translatePrompt }] }]
        });

        const translatedUserMessage = translationRes.text;

        // Agents response
        const agentPrompt = `User said (in ${translateFrom}): "${message}". Respond naturally in ${translateTo}.`;

        const agentRes = await client.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: [{ role: "user", parts: [{ text: agentPrompt }] }]
        });

        const agentReplyOriginal = agentRes.text;

        //translation of agent response
        const agentTranslatePrompt = `Translate this from ${translateTo} to ${translateFrom}. Only output the translation.${agentReplyOriginal}`;

        const agentTranslateRes = await client.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: [{ role: "user", parts: [{ text: agentTranslatePrompt }] }]
        });

        const agentReplyTranslated = agentTranslateRes.text;

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

app.listen(3001, () => {
    console.log("Server running on port 3001");
});