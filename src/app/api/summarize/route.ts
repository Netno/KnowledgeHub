import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { query, summaries, language } = await request.json();

    const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });

    const isSv = language === "sv";
    const today = new Date().toISOString().slice(0, 10);
    const prompt = isSv
      ? `Du är en analytiker. Dagens datum är ${today}. Användaren sökte på: "${query}"

Här är de ${summaries.length} matchande posterna (varje post har datum i formatet [YYYY-MM-DD]):
${summaries
  .slice(0, 10)
  .map((s: string) => `- ${s}`)
  .join("\n")}

Skriv en kort, användbar sammanfattning (2-3 meningar) som svarar på frågan baserat på dessa resultat.
Svara på svenska. Var konkret och nämn specifika detaljer eller mönster du ser.
Om frågan handlar om tid (idag, igår, senaste veckan etc), var extra noggrann med att bara referera till poster från rätt datum.`
      : `You are an analyst. Today's date is ${today}. The user searched for: "${query}"

Here are the ${summaries.length} matching entries (each prefixed with date [YYYY-MM-DD]):
${summaries
  .slice(0, 10)
  .map((s: string) => `- ${s}`)
  .join("\n")}

Write a short, useful summary (2-3 sentences) answering the question based on these results.
Be concrete and mention specific details or patterns you see.
If the question is about time (today, yesterday, this week, etc), be extra careful to only reference entries from the correct dates.`;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ summary: result.response.text() });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json({ summary: "" }, { status: 500 });
  }
}
