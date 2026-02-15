import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "sv,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
        },
        { status: 502 },
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      return NextResponse.json(
        { error: "URL does not point to an HTML page" },
        { status: 400 },
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract page title
    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text().trim() ||
      $("h1").first().text().trim() ||
      "";

    // Extract description
    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      "";

    // Remove unwanted elements
    $(
      "script:not([type='application/ld+json']), style, nav, footer, header, iframe, noscript, svg, " +
        "form, button, input, select, textarea, " +
        "[role='navigation'], [role='banner'], [role='contentinfo'], " +
        ".cookie-banner, .cookie-consent, .ad, .advertisement, " +
        ".sidebar, .menu, .nav, .footer, .header, " +
        "#cookie-banner, #cookie-consent",
    ).remove();

    // Try to extract structured data (JSON-LD)
    let structuredText = "";
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).text());
        const items = Array.isArray(json) ? json : [json];
        for (const item of items) {
          if (item["@type"] === "Recipe" || item["@type"]?.includes("Recipe")) {
            const parts: string[] = [];
            if (item.name) parts.push(`## ${item.name}\n`);
            if (item.description) parts.push(item.description);
            if (item.recipeIngredient) {
              parts.push("\n## Ingredienser\n");
              for (const ing of item.recipeIngredient) parts.push(`• ${ing}`);
            }
            if (item.recipeInstructions) {
              parts.push("\n## Instruktioner\n");
              const steps = Array.isArray(item.recipeInstructions) ? item.recipeInstructions : [item.recipeInstructions];
              steps.forEach((step: { text?: string } | string, i: number) => {
                const t = typeof step === "string" ? step : step.text || "";
                if (t) parts.push(`${i + 1}. ${t}`);
              });
            }
            structuredText = parts.join("\n");
          }
        }
      } catch { /* ignore parse errors */ }
    });

    // Try to find the main content area
    const mainContent = $("article").first().length
      ? $("article").first()
      : $("main").first().length
        ? $("main").first()
        : $('[role="main"]').first().length
          ? $('[role="main"]').first()
          : $(
                ".recipe, .recipe-content, .post-content, .entry-content, .article-content",
              ).first().length
            ? $(
                ".recipe, .recipe-content, .post-content, .entry-content, .article-content",
              ).first()
            : $("body");

    // Extract text content
    let text = mainContent
      .find(
        "p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption, dt, dd",
      )
      .map((_, el) => {
        const tagName = el.type === "tag" ? el.name : "";
        const content = $(el).text().trim();
        if (!content) return null;

        // Add heading markers
        if (tagName.match(/^h[1-6]$/)) {
          return `\n## ${content}\n`;
        }
        if (tagName === "li") {
          return `• ${content}`;
        }
        return content;
      })
      .get()
      .filter(Boolean)
      .join("\n");

    // Clean up whitespace
    text = text
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    // Prefer structured data over scraped text if available
    if (structuredText.length > 100) {
      text = structuredText;
    }

    // If very little text was extracted (JS-rendered page), use Gemini to extract content
    if (text.length < 200) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });
        const prompt = `I need you to extract the full content from this web page. The page is likely rendered with JavaScript so I could only get the meta data.

URL: ${parsedUrl.href}
Title: ${title}
Description: ${description}

Based on the URL and meta info, this appears to be a web page. Please provide the full content of this page in a well-structured format. If it's a recipe, include the title, description, ingredients list, and step-by-step instructions. If it's an article, include the full text.

Important: Only output the actual content, no explanations or meta-commentary. Write in the same language as the page (Swedish if it's a Swedish site).`;

        const result = await model.generateContent(prompt);
        const aiText = result.response.text().trim();
        if (aiText.length > text.length) {
          text = aiText;
        }
      } catch (aiError) {
        console.error("Gemini fallback error:", aiError);
        // If Gemini also fails, use description as last resort
        if (description && text.length < 50) {
          text = description;
        }
      }
    }

    // Truncate if extremely long
    if (text.length > 50000) {
      text = text.slice(0, 50000) + "\n\n[Content truncated]";
    }

    return NextResponse.json({
      title,
      description,
      text,
      url: parsedUrl.href,
    });
  } catch (error) {
    console.error("URL extraction error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to extract content: ${message}` },
      { status: 500 },
    );
  }
}
