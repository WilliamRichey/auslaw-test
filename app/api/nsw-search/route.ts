import { NextResponse } from "next/server";
import { searchNSWCaseLaw, COURTS, TRIBUNALS } from "@/lib/nsw-caselaw";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const body = url.searchParams.get("body") || undefined;
  const title = url.searchParams.get("title") || undefined;
  const before = url.searchParams.get("before") || undefined;
  const catchwords = url.searchParams.get("catchwords") || undefined;
  const party = url.searchParams.get("party") || undefined;
  const mnc = url.searchParams.get("mnc") || undefined;
  const startDate = url.searchParams.get("startDate") || undefined;
  const endDate = url.searchParams.get("endDate") || undefined;
  const fileNumber = url.searchParams.get("fileNumber") || undefined;
  const legislationCited = url.searchParams.get("legislationCited") || undefined;
  const casesCited = url.searchParams.get("casesCited") || undefined;
  const sort = url.searchParams.get("sort") || undefined;
  const page = url.searchParams.has("page")
    ? parseInt(url.searchParams.get("page")!, 10)
    : 0;

  // Accept comma-separated court/tribunal keys
  const courts = url.searchParams.get("courts")?.split(",").filter(Boolean) || undefined;
  const tribunals = url.searchParams.get("tribunals")?.split(",").filter(Boolean) || undefined;

  // Must have at least one search parameter
  if (!body && !title && !before && !catchwords && !party && !mnc && !fileNumber && !legislationCited && !casesCited) {
    return NextResponse.json(
      { error: "At least one search parameter is required" },
      { status: 400 }
    );
  }

  try {
    const data = await searchNSWCaseLaw({
      body, title, before, catchwords, party, mnc,
      startDate, endDate, fileNumber, legislationCited, casesCited,
      courts, tribunals, page, sort,
    });

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Also expose court/tribunal metadata
export async function POST() {
  return NextResponse.json({ courts: COURTS, tribunals: TRIBUNALS });
}
