import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(req: Request) {
  try {
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const body = await req.json();
    const { transcript, resume, jobDescription, focus } = body;

    if (!transcript || transcript.length === 0) {
      return NextResponse.json({ error: "Transcript is empty" }, { status: 400 });
    }

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

    const completion = await groq.chat.completions.create({
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

    let content = completion.choices[0]?.message?.content || "{}";
    
    // Clean up potential markdown formatting from the LLM
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      content = jsonMatch[1];
    } else {
      content = content.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const result = JSON.parse(content);

    // Normalize output to ensure it matches schema exactly and prevents React crashes
    const normalizedResult = {
      overall_score: typeof result.overall_score === 'number' ? result.overall_score : parseFloat(result.overall_score) || 3,
      strengths: Array.isArray(result.strengths) ? result.strengths : (result.strengths ? [String(result.strengths)] : ["No specific strengths identified."]),
      weaknesses: Array.isArray(result.weaknesses) ? result.weaknesses : (result.weaknesses ? [String(result.weaknesses)] : ["No specific weaknesses identified."]),
      final_recommendation: typeof result.final_recommendation === 'string' ? result.final_recommendation : "Review Needed"
    };

    return NextResponse.json(normalizedResult);
  } catch (error: any) {
    console.error("Summarization API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate rubric" },
      { status: 500 }
    );
  }
}
