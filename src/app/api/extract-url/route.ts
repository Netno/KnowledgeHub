import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

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
      "script, style, nav, footer, header, iframe, noscript, svg, " +
        "form, button, input, select, textarea, " +
        "[role='navigation'], [role='banner'], [role='contentinfo'], " +
        ".cookie-banner, .cookie-consent, .ad, .advertisement, " +
        ".sidebar, .menu, .nav, .footer, .header, " +
        "#cookie-banner, #cookie-consent",
    ).remove();

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

    // If very little text was extracted, fall back to body text
    if (text.length < 100) {
      text = $("body").text().replace(/\s+/g, " ").trim();
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
