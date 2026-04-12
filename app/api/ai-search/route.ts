import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { listTools, callTool } from "@/lib/mcp-client";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an Australian legal research assistant. Use the provided tools to search for cases and legislation on AustLII.

Important tips for effective searches:
- Use method "any" for broad topic searches with multiple keywords
- Use method "title" to find a specific case by name
- Use method "phrase" for exact legal phrases
- AustLII does not support wildcards or empty queries — for "latest cases" use a common term like "order" with the right jurisdiction
- You may call search tools multiple times for comparative queries (e.g. search VIC then NSW separately)
- Do not make more than 3 tool calls total — search efficiently

IMPORTANT: After completing your searches, you MUST provide a final text response summarising what you found. Do NOT end with a tool call — always finish with a text summary. If the user asked for analysis or comparison, provide that based on the results returned. Keep your summary concise but informative.`;

// Convert MCP tool schemas to Claude API tool format
function mcpToolToClaudeTool(mcpTool: { name: string; description?: string; inputSchema: Record<string, unknown> }): Anthropic.Tool {
  return {
    name: mcpTool.name,
    description: mcpTool.description || "",
    input_schema: mcpTool.inputSchema as Anthropic.Tool.InputSchema,
  };
}

export async function POST(request: Request) {
  try {
    const { question } = await request.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    // Get available tools from the real auslaw-mcp server
    const mcpTools = await listTools();
    const tools = mcpTools.map(mcpToolToClaudeTool);

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: question },
    ];

    // Agentic loop
    let allResults: Record<string, unknown>[] = [];
    let interpretation = "";
    let searchParams: Record<string, unknown> | null = null;
    const maxIterations = 8;

    for (let i = 0; i < maxIterations; i++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      // Collect text blocks
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );

      if (toolUseBlocks.length === 0) {
        // No more tool calls — this is the final response with the summary
        if (textBlocks.length > 0) {
          interpretation = textBlocks.map((b) => b.text).join("\n");
        }
        break;
      }

      // Execute each tool call against the real MCP server
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const mcpResult = await callTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );

        // Extract text content from MCP response
        const resultText = Array.isArray(mcpResult)
          ? mcpResult
              .filter((c: { type: string }) => c.type === "text")
              .map((c: { type: string; text: string }) => c.text)
              .join("\n")
          : JSON.stringify(mcpResult);

        // Try to parse results for the UI
        try {
          const parsed = JSON.parse(resultText);
          const data = parsed.data || parsed.results || parsed;
          if (Array.isArray(data)) {
            allResults = allResults.concat(data);
          }
        } catch {
          // Not JSON, that's fine
        }

        // Capture first search params for display
        if (!searchParams) {
          const input = toolUse.input as Record<string, unknown>;
          searchParams = {
            tool: toolUse.name,
            query: input.query,
            jurisdiction: input.jurisdiction || null,
            method: input.method || "auto",
          };
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: resultText,
        });
      }

      // Add assistant message and tool results to conversation
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
      searchParams,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
