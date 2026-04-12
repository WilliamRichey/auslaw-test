// Lightweight AustLII search — no external dependencies beyond Node builtins.

const AUSTLII_SEARCH = "https://www.austlii.edu.au/cgi-bin/sinosrch.cgi";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.austlii.edu.au/forms/search1.html",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const NEUTRAL_CITATION = /\[(\d{4})\]\s+([A-Z][A-Za-z0-9]+)\s+(\d+)/;
const REPORTED_CITATION = /\((\d{4})\)\s+\d+\s+[A-Z][A-Za-z]+\s+\d+/;

export interface SearchResult {
  title: string;
  neutralCitation?: string;
  reportedCitation?: string;
  url: string;
  summary?: string;
  jurisdiction?: string;
  year?: string;
}

function extractCitations(text: string) {
  const neutral = text.match(NEUTRAL_CITATION);
  const reported = text.match(REPORTED_CITATION);
  return {
    neutralCitation: neutral?.[0],
    reportedCitation: reported?.[0],
    year: neutral?.[1],
  };
}

export async function searchAustLii(
  query: string,
  options: {
    type?: "case" | "legislation";
    jurisdiction?: string;
    court?: string;
    limit?: number;
    method?: string;
  } = {}
): Promise<SearchResult[]> {
  const type = options.type ?? "case";
  const limit = options.limit ?? 10;
  const method = options.method ?? "auto";

  const jurisdictions: Record<string, string> = {
    cth: "cth", vic: "vic", nsw: "nsw", qld: "qld",
    sa: "sa", wa: "wa", tas: "tas", nt: "nt", act: "act", federal: "cth",
  };

  let maskPath = type === "case" ? "au/cases" : "au/legis";
  if (options.jurisdiction === "nz") {
    maskPath = type === "case" ? "nz/cases" : "nz/legis";
  } else if (options.jurisdiction && jurisdictions[options.jurisdiction]) {
    maskPath += `/${jurisdictions[options.jurisdiction]}`;
    // If a specific court is given, narrow the mask_path further
    if (options.court) {
      maskPath += `/${options.court}`;
    }
  }

  // Detect if query looks like a case name for sort order
  const isCaseName = /\bv\b/i.test(query);
  const view = isCaseName ? "relevance" : "date-latest";

  const url = new URL(AUSTLII_SEARCH);
  url.searchParams.set("method", method);
  url.searchParams.set("query", query);
  url.searchParams.set("meta", options.jurisdiction === "nz" ? "/austlii" : "/au");
  url.searchParams.set("results", String(limit));
  url.searchParams.set("mask_path", maskPath);
  url.searchParams.set("view", view);

  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) throw new Error(`AustLII returned ${res.status}`);
  const html = await res.text();

  // Parse results — AustLII result links contain /cgi-bin/viewdoc/
  const results: SearchResult[] = [];
  const linkRegex = /<a\s+href="(\/cgi-bin\/viewdoc\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
    const resultUrl = `https://www.austlii.edu.au${match[1]}`;
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    if (!title || title.length < 5) continue;

    // Skip journal articles and commentary
    if (/journal|article|review|law\s+quarterly/i.test(title)) continue;

    const citations = extractCitations(title);

    // Extract summary from surrounding text (court + date)
    const afterLink = html.slice(match.index + match[0].length, match.index + match[0].length + 200);
    const summaryText = afterLink.replace(/<[^>]+>/g, "").trim().split("\n")[0]?.trim();

    results.push({
      title,
      url: resultUrl,
      neutralCitation: citations.neutralCitation,
      reportedCitation: citations.reportedCitation,
      year: citations.year,
      jurisdiction: options.jurisdiction,
      summary: summaryText || undefined,
    });
  }

  return results;
}
