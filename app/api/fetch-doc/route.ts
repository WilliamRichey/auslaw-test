import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const docUrl = url.searchParams.get("url");

  if (!docUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // Only allow AustLII URLs
  const parsed = new URL(docUrl);
  if (!parsed.hostname.endsWith("austlii.edu.au")) {
    return NextResponse.json({ error: "Only AustLII URLs are supported" }, { status: 400 });
  }

  try {
    const res = await fetch(docUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.austlii.edu.au/",
      },
    });
    if (!res.ok) throw new Error(`AustLII returned ${res.status}`);
    const html = await res.text();

    // Strip HTML tags for plain text view
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&#\d+;/g, "")
      .trim();

    return NextResponse.json({ text: text.slice(0, 50000) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
