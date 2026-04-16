import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  searchNSWCaseLaw,
  COURT_LABELS,
  TRIBUNAL_LABELS,
} from "@/lib/nsw-caselaw";

export const maxDuration = 120;

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an Australian legal research assistant specialising in NSW case law. You search caselaw.nsw.gov.au using the provided tools.

Tips for effective searches:
- Use the "body" field for broad topic searches (searches full text of decisions)
- Use "title" to find a specific case by name
- Use "catchwords" for legal topic/keyword searches — this is often the most precise
- Use "party" to find cases involving a specific party
- Use "legislationCited" to find cases citing a specific Act or regulation
- Use "casesCited" to find cases citing a specific decision
- You can filter by specific courts or tribunals using their keys
- You may call the search tool multiple times with different parameters for comparative or broad queries
- Do not make more than 3 tool calls total — search efficiently
- Results are sorted by relevance by default; use sort "decisionDate,desc" for most recent

Available court keys: ${Object.entries(COURT_LABELS).map(([k, v]) => `${k} (${v})`).join(", ")}

Available tribunal keys: ${Object.entries(TRIBUNAL_LABELS).map(([k, v]) => `${k} (${v})`).join(", ")}

IMPORTANT: After completing your searches, you MUST provide a final text response summarising what you found. Do NOT end with a tool call — always finish with a text summary. Keep your summary concise but informative. Reference specific cases with their citations.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_nsw_caselaw",
    description:
      "Search NSW CaseLaw (caselaw.nsw.gov.au) for court and tribunal decisions. Returns case titles, citations, decision dates, judges, and catchwords. Searches 20 results per page.",
    input_schema: {
      type: "object" as const,
      properties: {
        body: {
          type: "string",
          description: "Full text search across entire decisions",
        },
        title: {
          type: "string",
          description: "Search by case name",
        },
        catchwords: {
          type: "string",
          description: "Search by catchwords/legal topics",
        },
        party: {
          type: "string",
          description: "Search by party name",
        },
        legislationCited: {
          type: "string",
          description:
            "Search for cases citing specific legislation (e.g. 'Civil Liability Act 2002')",
        },
        casesCited: {
          type: "string",
          description:
            "Search for cases citing a specific decision",
        },
        courts: {
          type: "array",
          items: { type: "string" },
          description:
            "Filter by court keys (e.g. ['supreme', 'court_of_appeal']). Omit to search all.",
        },
        tribunals: {
          type: "array",
          items: { type: "string" },
          description:
            "Filter by tribunal keys (e.g. ['ncat_appeal']). Omit to search all.",
        },
        sort: {
          type: "string",
          enum: [
            "decisionDate,desc",
            "decisionDate,asc",
            "",
          ],
          description:
            "Sort order. Empty string for relevance (default), or by decision date.",
        },
        page: {
          type: "number",
          description: "Page number (0-indexed, 20 results per page). Default 0.",
        },
      },
      required: [],
    },
  },
];

export async function POST(request: Request) {
  try {
    const { question } = await request.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 }
      );
    }

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: question },
    ];

    let allResults: Record<string, unknown>[] = [];
    let interpretation = "";
    let firstSearchParams: Record<string, unknown> | null = null;
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
        const input = toolUse.input as Record<string, unknown>;

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

        // Collect results for UI
        for (const r of searchResult.results) {
          allResults.push(r as unknown as Record<string, unknown>);
        }

        // Capture first search params for display
        if (!firstSearchParams) {
          firstSearchParams = {
            tool: "search_nsw_caselaw",
            ...input,
            totalResults: searchResult.totalResults,
          };
        }

        const resultText = JSON.stringify({
          totalResults: searchResult.totalResults,
          page: searchResult.page,
          totalPages: searchResult.totalPages,
          results: searchResult.results,
        });

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
      searchParams: firstSearchParams,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
