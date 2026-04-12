import { NextResponse } from "next/server";
import { searchAustLii } from "@/lib/auslaw";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  const type = (url.searchParams.get("type") as "case" | "legislation") || "case";
  const jurisdiction = url.searchParams.get("jurisdiction") || undefined;
  const method = url.searchParams.get("method") || undefined;
  const limit = Number(url.searchParams.get("limit")) || 10;

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const results = await searchAustLii(query, { type, jurisdiction, method, limit });
    return NextResponse.json({ results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
