import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const language = (formData.get("language") as string) || "sv";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });

    const prompt =
      language === "sv"
        ? "Beskriv bilden i detalj. Extrahera all synlig text. Var strukturerad och koncis."
        : "Describe the image in detail. Extract all visible text. Be structured and concise.";

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: file.type,
          data: base64,
        },
      },
    ]);

    const description = result.response.text();
    return NextResponse.json({ description });
  } catch (error) {
    console.error("Describe image error:", error);
    return NextResponse.json(
      { error: "Failed to analyze image", description: "" },
      { status: 500 },
    );
  }
}
