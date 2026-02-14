import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { content, fileInfo } = await request.json();

    const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });

    const prompt = `Analyze the following content and extract structured information.
Return a JSON object with these fields (include only what you can identify):
- summary: Brief 1-2 sentence summary
- topics: Array of main topics/themes
- entities: Array of named entities (people, companies, products, etc.)
- category: Best fitting category (e.g., "Feedback", "Idea", "Bug Report", "Meeting Notes", "Research", "Question", "Documentation", etc.)
- sentiment: "positive", "negative", "neutral", or "mixed"
- action_items: Array of any action items or tasks mentioned
- key_points: Array of main takeaways

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
    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze content", summary: "Analysis unavailable" },
      { status: 500 },
    );
  }
}
