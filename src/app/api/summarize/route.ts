import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { query, summaries, language, dateContext, totalCount } =
      await request.json();

    const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });

    const isSv = language === "sv";
    const today = new Date().toISOString().slice(0, 10);
    const count = totalCount || summaries.length;
    const summaryList = summaries.map((s: string) => `- ${s}`).join("\n");

    const dateNote = dateContext
      ? isSv
        ? `\nOBS: Alla ${count} poster nedan är hämtade från perioden ${dateContext}. Svara direkt med antalet poster (${count} st).`
        : `\nNOTE: All ${count} entries below are from the period ${dateContext}. State the entry count (${count}) directly.`
      : "";

    const prompt = isSv
      ? `Du är en analytiker. Dagens datum är ${today}. Användaren sökte på: "${query}"${dateNote}

Här är data om de matchande posterna:
${summaryList}

Skriv en kort, användbar sammanfattning (2-3 meningar) som svarar på frågan baserat på dessa resultat.
Svara på svenska. Var konkret och nämn specifika detaljer eller mönster du ser.`
      : `You are an analyst. Today's date is ${today}. The user searched for: "${query}"${dateNote}

Here is data about the matching entries:
${summaryList}

Write a short, useful summary (2-3 sentences) answering the question based on these results.
Be concrete and mention specific details or patterns you see.`;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ summary: result.response.text() });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json({ summary: "" }, { status: 500 });
  }
}
