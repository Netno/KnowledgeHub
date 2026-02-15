import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const bytes = await file.arrayBuffer();

    let text = "";

    if (name.endsWith(".pdf")) {
      text = await extractPDF(bytes);
    } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
      text = await extractDOCX(bytes);
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      text = extractXLSX(bytes);
    } else {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 },
      );
    }

    return NextResponse.json({ text: text.slice(0, 50000) });
  } catch (error) {
    console.error("Extract text error:", error);
    return NextResponse.json(
      { error: "Failed to extract text" },
      { status: 500 },
    );
  }
}

async function extractPDF(buffer: ArrayBuffer): Promise<string> {
  // Dynamic import to avoid bundling issues
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    .promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .filter((item: any) => "str" in item)
      .map((item: any) => item.str);
    pages.push(strings.join(" "));
  }

  return pages.join("\n\n");
}

async function extractDOCX(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

function extractXLSX(buffer: ArrayBuffer): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`[${sheetName}]\n${csv}`);
  }

  return parts.join("\n\n");
}
