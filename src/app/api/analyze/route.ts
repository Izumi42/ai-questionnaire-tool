import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { transcript, focus = "General Technical" } = await req.json();

    if (!transcript || transcript.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const prompt = `
      You are an expert ${focus} interview co-pilot.
      You are listening to a live transcript of an ongoing interview.
      Analyze the transcript and provide 1-3 highly relevant insights or follow-up questions for the interviewer to ask the candidate.
      
      Focus ONLY on the most recent context. Tailor your questions specifically for a ${focus} interview. If the candidate just gave a vague answer, suggest a question to dig deeper. If they showed a red flag, point it out.
      
      Transcript so far:
      ${transcript.map((t: any) => `${t.role}: ${t.text}`).join("\n")}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: "The type of suggestion: 'follow-up', 'insight', or 'red-flag'",
              },
              text: {
                type: Type.STRING,
                description: "The actual question or observation to show the interviewer",
              },
            },
            required: ["type", "text"],
          },
        },
      },
    });

    const suggestions = JSON.parse(response.text() || "[]");

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ error: "Failed to analyze transcript" }, { status: 500 });
  }
}
