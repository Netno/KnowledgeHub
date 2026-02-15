import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { entryId, analysis, targetLang } = await request.json();

    if (!analysis || !targetLang) {
      return NextResponse.json(
        { error: "Missing parameters" },
        { status: 400 },
      );
    }

    // Check if translation already cached
    if (analysis._translations?.[targetLang]) {
      return NextResponse.json({
        translated: analysis._translations[targetLang],
      });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const langName = targetLang === "sv" ? "Swedish" : "English";

    const fieldsToTranslate: Record<string, unknown> = {};
    if (analysis.summary) fieldsToTranslate.summary = analysis.summary;
    if (analysis.category) fieldsToTranslate.category = analysis.category;
    if (analysis.topics?.length) fieldsToTranslate.topics = analysis.topics;
    if (analysis.entities?.length)
      fieldsToTranslate.entities = analysis.entities;
    if (analysis.sentiment) fieldsToTranslate.sentiment = analysis.sentiment;
    if (analysis.action_items?.length)
      fieldsToTranslate.action_items = analysis.action_items;
    if (analysis.key_points?.length)
      fieldsToTranslate.key_points = analysis.key_points;

    const prompt = `Translate the following JSON values to ${langName}. Keep the same JSON structure and keys. Only translate the string values. Keep named entities (proper nouns, brand names, place names) in their original form when appropriate.

${JSON.stringify(fieldsToTranslate, null, 2)}

Respond with ONLY valid JSON, no markdown formatting.`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    // Remove markdown code blocks if present
    if (text.startsWith("```")) {
      const lines = text.split("\n");
      text = lines.slice(1, -1).join("\n");
    }

    const translated = JSON.parse(text);

    // Save translation back to DB if we have an entryId
    if (entryId) {
      const supabase = await createClient();
      const updatedAnalysis = {
        ...analysis,
        _lang: analysis._lang || (targetLang === "sv" ? "en" : "sv"),
        _translations: {
          ...(analysis._translations || {}),
          [targetLang]: translated,
        },
      };
      await supabase
        .from("entries")
        .update({ ai_analysis: updatedAnalysis })
        .eq("id", entryId);
    }

    return NextResponse.json({ translated });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json({ error: "Failed to translate" }, { status: 500 });
  }
}
