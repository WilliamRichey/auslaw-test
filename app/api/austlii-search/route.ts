import { NextResponse } from "next/server";
import { searchCases, getCaseCount, getCourtCounts } from "@/lib/db";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const query = url.searchParams.get("q") || "";
  const jurisdiction = url.searchParams.get("jurisdiction") || undefined;
  const court = url.searchParams.get("court") || undefined;
  const yearFrom = url.searchParams.has("yearFrom")
    ? parseInt(url.searchParams.get("yearFrom")!, 10)
    : undefined;
  const yearTo = url.searchParams.has("yearTo")
    ? parseInt(url.searchParams.get("yearTo")!, 10)
    : undefined;
  const page = url.searchParams.has("page")
    ? parseInt(url.searchParams.get("page")!, 10)
    : 0;

  if (!query) {
    return NextResponse.json(
      { error: "q (search query) is required" },
      { status: 400 }
    );
  }

  try {
    const data = searchCases({
      query,
      jurisdiction,
      court,
      yearFrom,
      yearTo,
      page,
    });

    return NextResponse.json({
      results: data.results.map((r) => ({
        title: r.title,
        url: r.url,
        citation: r.neutral_citation,
        jurisdiction: r.jurisdiction,
        court: r.court_code,
        year: r.year,
        decisionDate: r.decision_date,
        catchwords: r.catchwords,
        source: "austlii",
      })),
      totalResults: data.totalResults,
      page: data.page,
      totalPages: data.totalPages,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST returns cache stats
export async function POST() {
  try {
    const total = getCaseCount();
    const courts = getCourtCounts();
    return NextResponse.json({ totalCases: total, courts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
