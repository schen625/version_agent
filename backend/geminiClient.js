import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({
  apiKey: process.env.API_KEY,
  apiVersion: "v1alpha"
});

export default client;