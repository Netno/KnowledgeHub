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

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const analyzePrompt = `Analyze the following content and extract structured information.
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
