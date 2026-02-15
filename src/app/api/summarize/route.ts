import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const {
      query,
      summaries,
      language,
      dateContext,
      totalCount,
      categories,
      entities,
      isLatestQuery,
    } = await request.json();

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
      },
    });

    const isSv = language === "sv";
    const today = new Date().toISOString().slice(0, 10);
    const count = totalCount || summaries.length;
    const summaryList = summaries.map((s: string) => `- ${s}`).join("\n");

    // Build metadata context
    let metaContext = "";
    if (categories && Object.keys(categories).length > 0) {
      const catList = Object.entries(categories)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([cat, n]) => `${cat}: ${n}`)
        .join(", ");
      metaContext += isSv
        ? `\nFördelning per kategori: ${catList}`
        : `\nBreakdown by category: ${catList}`;
    }
    if (entities && entities.length > 0) {
      metaContext += isSv
        ? `\nOmnämnda kunder/entiteter: ${entities.join(", ")}`
        : `\nMentioned customers/entities: ${entities.join(", ")}`;
    }

    const dateNote = dateContext
      ? isSv
        ? `\nAlla ${count} poster är från perioden ${dateContext}.`
        : `\nAll ${count} entries are from the period ${dateContext}.`
      : "";

    // Build format instructions based on query type
    let formatInstructions: string;
    if (isLatestQuery) {
      formatInstructions = isSv
        ? `INSTRUKTIONER:
Användaren vill se de senaste posterna. Lista VARJE post som en numrerad rad med datum och kort beskrivning.
Format:
1. **[datum]** — kort beskrivning (kategori, kund om relevant)
2. **[datum]** — kort beskrivning
... osv.

Efter listan, skriv en kort sammanfattande mening (1 mening).
Svara på svenska.`
        : `INSTRUCTIONS:
The user wants to see the latest entries. List EACH entry as a numbered line with date and short description.
Format:
1. **[date]** — short description (category, customer if relevant)
2. **[date]** — short description
... etc.

After the list, write one brief summary sentence.
Respond in English.`;
    } else {
      formatInstructions = isSv
        ? `INSTRUKTIONER FÖR DITT SVAR:
Du MÅSTE svara med markdown. Strukturera svaret exakt så här:

1. En sammanfattande mening på max 2 rader.
2. Sedan en markdown-punktlista (med -) med de viktigaste insikterna.

Regler:
- Skriv ALDRIG ett enda långt stycke. Använd ALLTID punktlista.
- Nämn specifika kunder, datum och teman.
- Var koncis. Max 4-6 punkter.
- Svara på svenska.`
        : `INSTRUCTIONS FOR YOUR ANSWER:
You MUST respond with markdown. Structure your answer exactly like this:

1. A summary sentence of max 2 lines.
2. Then a markdown bullet list (using -) with the key insights.

Rules:
- NEVER write a single long paragraph. ALWAYS use bullet points.
- Mention specific customers, dates and themes.
- Be concise. Max 4-6 bullet points.
- Respond in English.`;
    }

    const prompt = isSv
      ? `Du är en insiktsfull analytiker. Dagens datum är ${today}.
Användaren sökte: "${query}"${dateNote}${metaContext}

Data:
${summaryList}

${formatInstructions}`
      : `You are an insightful analyst. Today's date is ${today}.
User searched: "${query}"${dateNote}${metaContext}

Data:
${summaryList}

${formatInstructions}`;

    const result = await model.generateContent(prompt);
    return NextResponse.json({ summary: result.response.text() });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json({ summary: "" }, { status: 500 });
  }
}
