import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { content, fileInfo, language } = await request.json();

    const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });

    const langInstruction =
      language === "sv"
        ? "Svara på svenska."
        : language === "en"
          ? "Respond in English."
          : "Respond in the same language as the content.";

    const categoryExamples =
      language === "sv"
        ? '"Feedback", "Idé", "Buggrapport", "Mötesanteckningar", "Forskning", "Fråga", "Dokumentation", "Recept", "Anteckning", "Övrigt"'
        : '"Feedback", "Idea", "Bug Report", "Meeting Notes", "Research", "Question", "Documentation", "Recipe", "Note", "Other"';

    const prompt = `Analyze the following content and extract structured information.
Return a JSON object with these fields (include only what you can identify):
- summary: Brief 1-2 sentence summary of what this is about. Be specific — mention the customer/requester and the actual feature or issue.
- topics: Array of 3-5 specific, searchable tags. These are critical for finding related entries later.
  RULES FOR TOPICS:
  - Be SPECIFIC, not generic. Use terms that describe exactly what this entry is about.
  - BAD examples: "Funktionalitet", "Support", "Användarbehov", "Arbetsflöde" (too generic, matches everything)
  - GOOD examples: "Tidsstyrda auktioner", "PDF-utskrift", "Bulkfakturering", "Sortering plocklistor", "Återköpskvitton"
  - Think: "If someone searches for this topic, would they find ONLY relevant entries?"
  - Include the specific feature, action, or domain area
  - Include the problem type if applicable (e.g., "Felhantering", "Behörighetsproblem")
- entities: Array of named entities (people, companies, products, specific object IDs, etc.)
- category: Best fitting category (e.g., ${categoryExamples})
- sentiment: "positive", "negative", "neutral", or "mixed"
- action_items: Array of any action items or tasks mentioned
- key_points: Array of main takeaways

${langInstruction}
All field values including summary, topics, category, action_items, and key_points MUST be in ${language === "sv" ? "Swedish" : "English"}.

Content:
${content}

${fileInfo ? `File info: ${fileInfo}` : ""}

Respond with ONLY valid JSON, no markdown formatting.`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    // Remove markdown code blocks if present
    if (text.startsWith("```")) {
      const lines = text.split("\n");
      text = lines.slice(1, -1).join("\n");
    }

    const analysis = JSON.parse(text);
    // Tag with source language for lazy translation
    analysis._lang = language || "en";
    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze content", summary: "Analysis unavailable" },
      { status: 500 },
    );
  }
}
