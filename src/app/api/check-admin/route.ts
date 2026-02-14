import { isAdmin } from "@/lib/access";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Get email from header (set by middleware or passed as query param)
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email") || "";

  return NextResponse.json({
    isAdmin: isAdmin(email),
  });
}
