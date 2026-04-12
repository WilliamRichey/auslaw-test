import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchAustLii } from "@/lib/auslaw";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a legal research assistant. The user will ask a natural language question about Australian or New Zealand law. Your job is to convert their question into structured search parameters for the AustLII legal database.

Respond with ONLY a JSON object (no markdown, no explanation) with these fields:
- "query": the search terms to send to AustLII (extract key legal terms, case names, or topics — strip conversational words). IMPORTANT: AustLII does not support wildcards or empty queries. If the user wants "all recent" decisions from a court, use a very common legal term like "order" or "application" as the query — the date sorting will show the latest cases.
- "type": "case" or "legislation"
- "jurisdiction": one of "cth", "nsw", "vic", "qld", "sa", "wa", "tas", "nt", "act", "nz", or null for all
- "court": the AustLII court database code if the user specifies a particular court, or null for all courts in the jurisdiction. Common codes:
  Commonwealth: "HCA" (High Court), "FCA" (Federal Court), "FCAFC" (Full Federal Court), "FedCFamC2F" (Federal Circuit Court)
  NSW: "NSWSC" (Supreme Court), "NSWCA" (Court of Appeal), "NSWDC" (District Court), "NSWLEC" (Land & Environment)
  VIC: "VSC" (Supreme Court), "VSCA" (Court of Appeal), "VCC" (County Court)
  QLD: "QSC" (Supreme Court), "QCA" (Court of Appeal), "QDC" (District Court)
  SA: "SASC" (Supreme Court), "SASCFC" (Full Court)
  WA: "WASC" (Supreme Court), "WASCA" (Court of Appeal)
  TAS: "TASSC" (Supreme Court), "TASFC" (Full Court)
  NT: "NTSC" (Supreme Court)
  ACT: "ACTSC" (Supreme Court), "ACTCA" (Court of Appeal)
  NZ: "NZSC" (Supreme Court), "NZCA" (Court of Appeal), "NZHC" (High Court)
- "method": one of "auto", "title", "phrase", "all", "any", "near" — pick the best:
  - "title" for finding a specific case by name (e.g. "Mabo v Queensland")
  - "phrase" for exact legal phrases (e.g. "duty of care")
  - "any" for topic searches with multiple keywords — this is usually the best choice for broad queries. AustLII's "auto" and "all" often return nothing for multi-word topic searches.
  - "all" only when every word MUST appear (very restrictive)
  - "auto" as a fallback for simple single-word queries
- "limit": number of results (default 10, max 20)
- "explanation": a brief one-sentence explanation of how you interpreted the query

Examples:
User: "Show me the latest Federal Court decisions from this week"
{"query":"order","type":"case","jurisdiction":"cth","court":"FCA","method":"auto","limit":10,"explanation":"Searching recent Federal Court decisions, sorted by date."}

User: "High Court cases decided in the last month"
{"query":"order","type":"case","jurisdiction":"cth","court":"HCA","method":"auto","limit":10,"explanation":"Searching recent High Court of Australia decisions, sorted by date."}

User: "Find cases about negligence in medical malpractice in NSW"
{"query":"negligence medical malpractice","type":"case","jurisdiction":"nsw","court":null,"method":"any","limit":10,"explanation":"Searching all NSW courts for negligence and medical malpractice."}

User: "NSW Supreme Court cases about defamation"
{"query":"defamation","type":"case","jurisdiction":"nsw","court":"NSWSC","method":"any","limit":10,"explanation":"Searching NSW Supreme Court for defamation cases."}

User: "Find cases about section 52 Trade Practices Act misleading and deceptive conduct"
{"query":"misleading deceptive conduct Trade Practices Act","type":"case","jurisdiction":null,"court":null,"method":"any","limit":15,"explanation":"Searching for cases on misleading and deceptive conduct under the Trade Practices Act."}

User: "What is the Privacy Act?"
{"query":"Privacy Act","type":"legislation","jurisdiction":"cth","court":null,"method":"title","limit":5,"explanation":"Searching Commonwealth legislation titles for the Privacy Act."}

User: "Find Mabo v Queensland"
{"query":"Mabo v Queensland","type":"case","jurisdiction":null,"court":null,"method":"title","limit":5,"explanation":"Searching for the specific case Mabo v Queensland by title."}`;

export async function POST(request: Request) {
  try {
    const { question } = await request.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    // Ask Claude to parse the question into search parameters
    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: question }],
    });

    let raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    // Strip markdown code fences if present
    raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    let params;
    try {
      params = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response", raw },
        { status: 500 }
      );
    }

    // Run the search with AI-extracted parameters
    const results = await searchAustLii(params.query, {
      type: params.type || "case",
      jurisdiction: params.jurisdiction || undefined,
      court: params.court || undefined,
      method: params.method || "auto",
      limit: Math.min(params.limit || 10, 20),
    });

    return NextResponse.json({
      results,
      interpretation: params.explanation,
      searchParams: {
        query: params.query,
        type: params.type,
        jurisdiction: params.jurisdiction,
        court: params.court,
        method: params.method,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
