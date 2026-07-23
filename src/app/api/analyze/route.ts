import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { transcript, focus = "General Technical", resume, jobDescription, agendaItems = [], currentSuggestions = [] } = await req.json();

    if (!transcript || transcript.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const prompt = `
      You are an expert ${focus} interview co-pilot.
      You are listening to a live transcript of an ongoing interview. 
      The transcript explicitly labels who is speaking: "Interviewer" (the one asking questions) and "Candidate" (the one answering).
      
      ${resume ? `The candidate's resume/background context is: \n${resume}\n` : ''}
      ${jobDescription ? `The job description they are applying for is: \n${jobDescription}\n` : ''}
      
      Analyze the candidate's answers and provide UP TO 2 highly relevant insights or follow-up questions for the interviewer to ask the candidate.
      Focus ONLY on the most recent context. Tailor your questions or insights specifically for a ${focus} interview. 
      CRITICAL RULE: You must ONLY generate follow-ups based on the CANDIDATE's statements. If the most recent statements in the transcript are from the Interviewer, do NOT suggest follow-up questions to their own statements. Only analyze and respond to what the Candidate says.
      If the candidate just gave a vague or contradictory answer, suggest probing follow-up questions to dig deeper. If they showed a red flag, point it out. Choose only the most critical scenarios to address.
      
      ${agendaItems.length > 0 ? `The interviewer has a mandatory checklist of agenda items they need to cover.
      Here are the currently unchecked agenda items:
      ${agendaItems.map((item: any) => `- ID: ${item.id} | Topic: ${item.text}`).join('\n')}
      If the Candidate has explicitly provided a sufficient answer to one of these agenda items in the recent transcript, include the ID of that agenda item in the "completed_agenda_ids" array. CRITICAL: DO NOT check off an agenda item just because the Interviewer asked the question or mentioned the topic. The item is ONLY complete when the CANDIDATE provides a substantive answer.
      IMPORTANT: DO NOT generate new "follow-up" suggestions that ask for the same information as the unchecked agenda items above. Only suggest entirely new follow-up questions.` : ''}

      ${currentSuggestions.length > 0 ? `The following questions/insights have ALREADY been suggested to the interviewer and are currently visible on their screen:
      ${currentSuggestions.map((s: string) => `- ${s}`).join('\n')}
      CRITICAL: DO NOT generate any new suggestions that are semantically similar to the ones listed above. You must come up with an entirely new angle.` : ''}
      
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
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0.5,
    });

    let rawContent = response.choices[0]?.message?.content || '{"suggestions":[]}';
    // Strip markdown formatting if the model wraps the JSON
    rawContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    let suggestionsObj;
    try {
      suggestionsObj = JSON.parse(rawContent);
    } catch (e) {
      console.error("Failed to parse AI response as JSON", rawContent);
      suggestionsObj = { suggestions: [], completed_agenda_ids: [] };
    }

    return NextResponse.json({ 
      suggestions: suggestionsObj.suggestions || [],
      completed_agenda_ids: suggestionsObj.completed_agenda_ids || []
    });
  } catch (error: any) {
    console.error("Groq API Error:", error);
    return NextResponse.json({ error: error.message || error.toString() || "Failed to analyze transcript" }, { status: 500 });
  }
}
