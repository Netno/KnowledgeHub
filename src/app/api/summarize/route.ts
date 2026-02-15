import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { query, summaries, language } = await request.json();

    const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });

    const isSv = language === "sv";
    const prompt = isSv
      ? `Du är en analytiker. Användaren sökte på: "${query}"

Här är de ${summaries.length} matchande posterna (sammanfattningar):
${summaries
  .slice(0, 10)
  .map((s: string) => `- ${s}`)
  .join("\n")}

Skriv en kort, användbar sammanfattning (2-3 meningar) som svarar på frågan baserat på dessa resultat. 
Svara på svenska. Var konkret och nämn specifika detaljer eller mönster du ser.`
      : `You are an analyst. The user searched for: "${query}"

Here are the ${summaries.length} matching entries (summaries):
${summaries
  .slice(0, 10)
  .map((s: string) => `- ${s}`)
  .join("\n")}

Write a short, useful summary (2-3 sentences) answering the question based on these results.
Be concrete and mention specific details or patterns you see.`;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ summary: result.response.text() });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json({ summary: "" }, { status: 500 });
  }
}
