import Groq from "groq-sdk";

export async function analyzeTranscriptClient(params: {
  apiKey: string;
  transcript: { speaker: string; text: string }[];
  focus: string;
  resume: string;
  jobDescription: string;
  agendaItems: { id: string; text: string; checked: boolean }[];
  currentSuggestions: string[];
}) {
  const { apiKey, transcript, focus, resume, jobDescription, agendaItems, currentSuggestions } = params;
  
  if (!apiKey) {
    throw new Error("Groq API Key is missing");
  }

  const groq = new Groq({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true // Required to use SDK client-side
  });

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
  rawContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  try {
    return JSON.parse(rawContent);
  } catch (e) {
    console.error("Failed to parse AI response as JSON", rawContent);
    return { suggestions: [], completed_agenda_ids: [] };
  }
}

export async function summarizeInterviewClient(params: {
  apiKey: string;
  transcript: { speaker: string; text: string }[];
  focus: string;
  resume: string;
  jobDescription: string;
}) {
  const { apiKey, transcript, focus, resume, jobDescription } = params;
  
  if (!apiKey) {
    throw new Error("Groq API Key is missing");
  }

  const groq = new Groq({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true
  });

  const transcriptText = transcript.map((msg: any) => 
    `${msg.speaker.toUpperCase()}: ${msg.text}`
  ).join("\n");

  const prompt = `
You are an expert technical recruiter and hiring manager.
Your task is to analyze the following interview transcript and provide a comprehensive final evaluation rubric.

Context:
- Role/Focus: ${focus || 'General'}
- Job Description: ${jobDescription || 'None provided'}
- Candidate Resume: ${resume || 'None provided'}

Interview Transcript:
${transcriptText}

Based on the transcript, generate a structured JSON object evaluating the candidate. 
Return ONLY valid JSON (no markdown formatting, no backticks, no explanations).

Expected JSON Structure:
{
  "overall_score": <number between 1 and 5>,
  "strengths": ["point 1", "point 2", ...],
  "weaknesses": ["point 1", "point 2", ...],
  "final_recommendation": "<Hire | Strong Hire | No Hire | Needs Follow-up>"
}
`;

  const response = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are a highly analytical hiring manager. Always output raw, valid JSON matching the exact schema requested.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    model: "llama-3.1-8b-instant",
    temperature: 0.3,
    response_format: { type: "json_object" }
  });

  let rawContent = response.choices[0]?.message?.content || '{}';
  rawContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  try {
    return JSON.parse(rawContent);
  } catch (e) {
    console.error("Failed to parse evaluation response", rawContent);
    return null;
  }
}
