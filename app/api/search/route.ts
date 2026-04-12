import { NextResponse } from "next/server";
import { callTool } from "@/lib/mcp-client";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  const type = url.searchParams.get("type") || "case";
  const jurisdiction = url.searchParams.get("jurisdiction") || undefined;
  const method = url.searchParams.get("method") || undefined;
  const limit = Number(url.searchParams.get("limit")) || 10;

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const toolName = type === "legislation" ? "search_legislation" : "search_cases";
    const args: Record<string, unknown> = { query, limit };
    if (jurisdiction) args.jurisdiction = jurisdiction;
    if (method) args.method = method;

    const mcpResult = await callTool(toolName, args);

    // Extract text content from MCP response
    const resultText = Array.isArray(mcpResult)
      ? mcpResult
          .filter((c: { type: string }) => c.type === "text")
          .map((c: { type: string; text: string }) => c.text)
          .join("\n")
      : JSON.stringify(mcpResult);

    const parsed = JSON.parse(resultText);
    const results = parsed.data || parsed.results || parsed;

    return NextResponse.json({ results: Array.isArray(results) ? results : [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
