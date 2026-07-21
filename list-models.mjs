import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  try {
    const response = await ai.models.list();
    for await (const model of response) {
      if (model.name.includes("flash") || model.name.includes("pro")) {
        console.log(model.name);
      }
    }
  } catch (e) {
    console.error("Failed:", e.message);
  }
}
run();
