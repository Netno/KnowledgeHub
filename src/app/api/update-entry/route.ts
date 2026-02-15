import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function PUT(request: NextRequest) {
  try {
    const { entryId, content, language } = await request.json();

    if (!entryId || !content?.trim()) {
      return NextResponse.json(
        { error: "Missing entryId or content" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Re-analyze with AI
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

    const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });
    const analyzePrompt = `Analyze the following content and extract structured information.
Return a JSON object with these fields (include only what you can identify):
- summary: Brief 1-2 sentence summary
- topics: Array of main topics/themes
- entities: Array of named entities (people, companies, products, etc.)
- category: Best fitting category (e.g., ${categoryExamples})
- sentiment: "positive", "negative", "neutral", or "mixed"
- action_items: Array of any action items or tasks mentioned
- key_points: Array of main takeaways

${langInstruction}
All field values including summary, topics, category, action_items, and key_points MUST be in ${language === "sv" ? "Swedish" : "English"}.

Content:
${content}

Respond with ONLY valid JSON, no markdown formatting.`;

    const analyzeResult = await model.generateContent(analyzePrompt);
    let analyzeText = analyzeResult.response.text().trim();
    if (analyzeText.startsWith("```")) {
      const lines = analyzeText.split("\n");
      analyzeText = lines.slice(1, -1).join("\n");
    }
    const aiAnalysis = JSON.parse(analyzeText);
    aiAnalysis._lang = language || "en";

    // Re-generate embedding
    const embeddingModel = genAI.getGenerativeModel({
      model: "gemini-embedding-001",
    });
    const embeddingResult = await embeddingModel.embedContent({
      content: { parts: [{ text: content.slice(0, 5000) }], role: "user" },
      taskType: TaskType.RETRIEVAL_DOCUMENT,
    });
    const embedding = embeddingResult.embedding.values;

    // Update in database
    const { error } = await supabase
      .from("entries")
      .update({
        content,
        ai_analysis: aiAnalysis,
        embedding,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      ai_analysis: aiAnalysis,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Update entry error:", error);
    return NextResponse.json(
      { error: `Failed to update: ${error}` },
      { status: 500 },
    );
  }
}
