import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  searchNSWCaseLaw,
  COURT_LABELS,
  TRIBUNAL_LABELS,
} from "@/lib/nsw-caselaw";
import { searchCases } from "@/lib/db";

export const maxDuration = 120;

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an Australian legal research assistant. You have two search tools:

1. **search_nsw_caselaw** — Live search of caselaw.nsw.gov.au. Best for NSW-specific queries, full-text search, tribunal decisions, and the most current NSW cases. Supports filtering by court/tribunal, searching by catchwords, party, legislation cited, etc.

2. **search_austlii_cache** — Search a local cache of AustLII cases covering multiple jurisdictions (HCA, FCA, FCAFC, NSWSC, NSWCA, NSWCCA, NSWDC, VSC, VSCA, QSC, QCA, SASC, SASCFC, WASC, WASCA). Best for cross-jurisdictional queries, High Court/Federal Court searches, and finding cases across Australia. Searches by title, citation, and catchwords. Cache covers recent years.

**When to use which:**
- For NSW court/tribunal cases, especially with full-text search → search_nsw_caselaw
- For High Court, Federal Court, or cross-jurisdictional queries → search_austlii_cache
- For broad questions, use both tools to get comprehensive results
- You may call tools multiple times with different parameters
- Do not make more than 4 tool calls total

**NSW CaseLaw court keys:** ${Object.entries(COURT_LABELS).map(([k, v]) => `${k} (${v})`).join(", ")}

**NSW CaseLaw tribunal keys:** ${Object.entries(TRIBUNAL_LABELS).map(([k, v]) => `${k} (${v})`).join(", ")}

**AustLII cache jurisdictions:** cth (Commonwealth), nsw, vic, qld, sa, wa

**AustLII cache court codes:** HCA, FCA, FCAFC, NSWSC, NSWCA, NSWCCA, NSWDC, VSC, VSCA, QSC, QCA, SASC, SASCFC, WASC, WASCA

IMPORTANT: After completing your searches, you MUST provide a final text response summarising what you found. Do NOT end with a tool call — always finish with a text summary. Keep your summary concise but informative. Reference specific cases with their citations.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_nsw_caselaw",
    description:
      "Live search of NSW CaseLaw (caselaw.nsw.gov.au) for NSW court and tribunal decisions. Returns case titles, citations, decision dates, judges, and catchwords.",
    input_schema: {
      type: "object" as const,
      properties: {
        body: { type: "string", description: "Full text search across entire decisions" },
        title: { type: "string", description: "Search by case name" },
        catchwords: { type: "string", description: "Search by catchwords/legal topics" },
        party: { type: "string", description: "Search by party name" },
        legislationCited: { type: "string", description: "Search for cases citing specific legislation" },
        casesCited: { type: "string", description: "Search for cases citing a specific decision" },
        courts: { type: "array", items: { type: "string" }, description: "Filter by NSW court keys. Omit to search all." },
        tribunals: { type: "array", items: { type: "string" }, description: "Filter by NSW tribunal keys. Omit to search all." },
        sort: { type: "string", enum: ["decisionDate,desc", "decisionDate,asc", ""], description: "Sort order." },
        page: { type: "number", description: "Page number (0-indexed). Default 0." },
      },
      required: [],
    },
  },
  {
    name: "search_austlii_cache",
    description:
      "Search the local AustLII cache covering HCA, FCA, FCAFC, NSWSC, NSWCA, VSC, VSCA, QSC, QCA, SASC, WASC and more. Best for cross-jurisdictional and federal court searches. Searches case titles, citations, and catchwords.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search text (matches title, citation, catchwords)" },
        jurisdiction: { type: "string", enum: ["cth", "nsw", "vic", "qld", "sa", "wa"], description: "Filter by jurisdiction" },
        court: { type: "string", description: "Filter by court code (HCA, FCA, NSWSC, etc.)" },
        yearFrom: { type: "number", description: "Filter cases from this year onwards" },
        yearTo: { type: "number", description: "Filter cases up to this year" },
        page: { type: "number", description: "Page number (0-indexed). Default 0." },
      },
      required: ["query"],
    },
  },
];

async function handleToolCall(
  toolUse: Anthropic.ToolUseBlock
): Promise<{ resultText: string; uiResults: Record<string, unknown>[] }> {
  const input = toolUse.input as Record<string, unknown>;
  const uiResults: Record<string, unknown>[] = [];

  if (toolUse.name === "search_nsw_caselaw") {
    const searchResult = await searchNSWCaseLaw({
      body: (input.body as string) || undefined,
      title: (input.title as string) || undefined,
      catchwords: (input.catchwords as string) || undefined,
      party: (input.party as string) || undefined,
      legislationCited: (input.legislationCited as string) || undefined,
      casesCited: (input.casesCited as string) || undefined,
      courts: (input.courts as string[]) || undefined,
      tribunals: (input.tribunals as string[]) || undefined,
      sort: (input.sort as string) || undefined,
      page: (input.page as number) || 0,
    });

    for (const r of searchResult.results) {
      uiResults.push({ ...r, source: "nsw_caselaw" } as unknown as Record<string, unknown>);
    }

    return {
      resultText: JSON.stringify({
        source: "nsw_caselaw",
        totalResults: searchResult.totalResults,
        page: searchResult.page,
        totalPages: searchResult.totalPages,
        results: searchResult.results,
      }),
      uiResults,
    };
  }

  if (toolUse.name === "search_austlii_cache") {
    const searchResult = searchCases({
      query: (input.query as string) || "",
      jurisdiction: (input.jurisdiction as string) || undefined,
      court: (input.court as string) || undefined,
      yearFrom: (input.yearFrom as number) || undefined,
      yearTo: (input.yearTo as number) || undefined,
      page: (input.page as number) || 0,
    });

    for (const r of searchResult.results) {
      uiResults.push({
        title: r.title,
        url: r.url,
        citation: r.neutral_citation,
        jurisdiction: r.jurisdiction,
        court: r.court_code,
        year: r.year,
        decisionDate: r.decision_date,
        catchwords: r.catchwords,
        source: "austlii",
      });
    }

    return {
      resultText: JSON.stringify({
        source: "austlii_cache",
        totalResults: searchResult.totalResults,
        page: searchResult.page,
        totalPages: searchResult.totalPages,
        results: searchResult.results.map((r) => ({
          title: r.title,
          neutral_citation: r.neutral_citation,
          year: r.year,
          decision_date: r.decision_date,
          catchwords: r.catchwords,
          url: r.url,
          jurisdiction: r.jurisdiction,
          court_code: r.court_code,
        })),
      }),
      uiResults,
    };
  }

  return { resultText: JSON.stringify({ error: "Unknown tool" }), uiResults: [] };
}

export async function POST(request: Request) {
  try {
    const { question } = await request.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: question },
    ];

    let allResults: Record<string, unknown>[] = [];
    let interpretation = "";
    const maxIterations = 8;

    for (let i = 0; i < maxIterations; i++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );

      if (toolUseBlocks.length === 0) {
        if (textBlocks.length > 0) {
          interpretation = textBlocks.map((b) => b.text).join("\n");
        }
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const { resultText, uiResults } = await handleToolCall(toolUse);
        allResults = allResults.concat(uiResults);

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: resultText,
        });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      if (response.stop_reason === "end_turn") break;
    }

    // Deduplicate results by URL
    const seen = new Set<string>();
    const uniqueResults = allResults.filter((r) => {
      const url = (r.url as string) || "";
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });

    return NextResponse.json({
      results: uniqueResults,
      interpretation,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
