import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { transcript, focus = "General Technical", resume, jobDescription, agendaItems = [] } = await req.json();

    if (!transcript || transcript.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const prompt = `
      You are an expert ${focus} interview co-pilot.
      You are listening to a live transcript of an ongoing interview. 
      The transcript explicitly labels who is speaking: "Interviewer" (the one asking questions) and "Candidate" (the one answering).
      
      ${resume ? `The candidate's resume/background context is: \n${resume}\n` : ''}
      ${jobDescription ? `The job description they are applying for is: \n${jobDescription}\n` : ''}
      
      Analyze the candidate's answers and provide 1-3 highly relevant insights or follow-up questions for the interviewer to ask the candidate.
      Focus ONLY on the most recent context. Tailor your questions specifically for a ${focus} interview. If the candidate just gave a vague or contradictory answer, suggest a probing follow-up question to dig deeper. If they showed a red flag, point it out.
      
      ${agendaItems.length > 0 ? `The interviewer has a mandatory checklist of agenda items they need to cover.
      Here are the currently unchecked agenda items:
      ${agendaItems.map((item: any) => `- ID: ${item.id} | Topic: ${item.text}`).join('\n')}
      If the interviewer has asked a question that satisfies one of these agenda items in the recent transcript, OR if the candidate has proactively provided a sufficient answer to the topic, include the ID of that agenda item in the "completed_agenda_ids" array.` : ''}
      
      You MUST respond in valid JSON format. Return a JSON object with:
      1. "suggestions": an array of objects. Each object must have:
         - "type": either "follow-up", "insight", or "red-flag"
         - "text": the actual question or observation
      2. "completed_agenda_ids": an array of string IDs representing the agenda items that were successfully covered in the transcript. If none were covered, return an empty array [].
      
      Transcript so far:
      ${transcript.map((t: any) => `${t.speaker === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${t.text}`).join("\n")}
    `;

    const response = await groq.chat.completions.create({
      messages: [
        { role: "system", content: prompt }
      ],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      temperature: 0.5,
    });

    const suggestionsObj = JSON.parse(response.choices[0]?.message?.content || '{"suggestions":[]}');

    return NextResponse.json({ 
      suggestions: suggestionsObj.suggestions || [],
      completed_agenda_ids: suggestionsObj.completed_agenda_ids || []
    });
  } catch (error: any) {
    console.error("Groq API Error:", error);
    return NextResponse.json({ error: error.message || error.toString() || "Failed to analyze transcript" }, { status: 500 });
  }
}
