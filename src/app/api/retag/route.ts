import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { content, language } = await request.json();

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const langInstruction =
      language === "sv"
        ? "Svara på svenska."
        : language === "en"
          ? "Respond in English."
          : "Respond in the same language as the content.";

    const prompt = `Analyze the following content and extract ONLY tags and entities.
Return a JSON object with ONLY these two fields:
- topics: Array of 3-5 specific, searchable tags.
  RULES FOR TOPICS:
  - Be SPECIFIC, not generic. Use terms that describe exactly what this entry is about.
  - BAD examples: "Funktionalitet", "Support", "Användarbehov", "Arbetsflöde" (too generic, matches everything)
  - GOOD examples: "Tidsstyrda auktioner", "PDF-utskrift", "Bulkfakturering", "Sortering plocklistor", "Återköpskvitton"
  - Think: "If someone searches for this topic, would they find ONLY relevant entries?"
  - Include the specific feature, action, or domain area
  - Include the problem type if applicable (e.g., "Felhantering", "Behörighetsproblem")
- entities: Array of named entities (people, companies, products, specific customer names, etc.)

${langInstruction}
All values MUST be in ${language === "sv" ? "Swedish" : "English"}.

Content:
${content}

Respond with ONLY valid JSON, no markdown formatting.`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    if (text.startsWith("```")) {
      const lines = text.split("\n");
      text = lines.slice(1, -1).join("\n");
    }

    const { topics, entities } = JSON.parse(text);
    return NextResponse.json({ topics: topics || [], entities: entities || [] });
  } catch (error) {
    console.error("Retag error:", error);
    return NextResponse.json(
      { error: "Failed to retag" },
      { status: 500 },
    );
  }
}
