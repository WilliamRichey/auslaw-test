import * as cheerio from "cheerio";

const BASE_URL = "https://www.caselaw.nsw.gov.au";

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
const SEARCH_URL = `${BASE_URL}/search/advanced`;
const PAGE_SIZE = 20;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const COURTS: Record<string, string> = {
  "childrens": "54a634063004de94513d827a",
  "compensation": "54a634063004de94513d827b",
  "court_of_appeal": "54a634063004de94513d8278",
  "court_of_criminal_appeal": "54a634063004de94513d8279",
  "district": "54a634063004de94513d827c",
  "drug": "54a634063004de94513d827d",
  "industrial": "54a634063004de94513d828e",
  "irc_commissioners": "54a634063004de94513d8285",
  "irc_judges": "54a634063004de94513d827e",
  "lec_commissioners": "54a634063004de94513d827f",
  "lec_judges": "54a634063004de94513d8286",
  "local": "54a634063004de94513d8280",
  "supreme": "54a634063004de94513d8281",
};

export const TRIBUNALS: Record<string, string> = {
  "adt_appeal": "54a634063004de94513d8282",
  "adt_divisions": "54a634063004de94513d8287",
  "ncat_admin": "54a634063004de94513d8289",
  "ncat_appeal": "54a634063004de94513d828d",
  "ncat_consumer": "54a634063004de94513d828b",
  "ncat_enforcement": "173b71a8beab2951cc1fab8d",
  "ncat_guardianship": "54a634063004de94513d828c",
  "ncat_occupational": "54a634063004de94513d828a",
  "dust_diseases": "54a634063004de94513d8283",
  "equal_opportunity": "1723173e41f6b6d63f2105d3",
  "fair_trading": "5e5c92e1e4b0c8604babc749",
  "legal_services": "5e5c92c5e4b0c8604babc748",
  "medical": "54a634063004de94513d8284",
  "transport_appeal": "54a634063004de94513d8288",
};

// Human-readable labels
export const COURT_LABELS: Record<string, string> = {
  "childrens": "Children's Court",
  "compensation": "Compensation Court",
  "court_of_appeal": "Court of Appeal",
  "court_of_criminal_appeal": "Court of Criminal Appeal",
  "district": "District Court",
  "drug": "Drug Court",
  "industrial": "Industrial Court",
  "irc_commissioners": "IRC (Commissioners)",
  "irc_judges": "IRC (Judges)",
  "lec_commissioners": "LEC (Commissioners)",
  "lec_judges": "LEC (Judges)",
  "local": "Local Court",
  "supreme": "Supreme Court",
};

export const TRIBUNAL_LABELS: Record<string, string> = {
  "adt_appeal": "ADT (Appeal Panel)",
  "adt_divisions": "ADT (Divisions)",
  "ncat_admin": "NCAT (Admin & Equal Opp)",
  "ncat_appeal": "NCAT (Appeal Panel)",
  "ncat_consumer": "NCAT (Consumer & Commercial)",
  "ncat_enforcement": "NCAT (Enforcement)",
  "ncat_guardianship": "NCAT (Guardianship)",
  "ncat_occupational": "NCAT (Occupational)",
  "dust_diseases": "Dust Diseases Tribunal",
  "equal_opportunity": "Equal Opportunity Tribunal",
  "fair_trading": "Fair Trading Tribunal",
  "legal_services": "Legal Services Tribunal",
  "medical": "Medical Tribunal",
  "transport_appeal": "Transport Appeal Boards",
};

export interface NSWSearchParams {
  body?: string;
  title?: string;
  before?: string;
  catchwords?: string;
  party?: string;
  mnc?: string;
  startDate?: string;
  endDate?: string;
  fileNumber?: string;
  legislationCited?: string;
  casesCited?: string;
  courts?: string[];
  tribunals?: string[];
  page?: number;
  sort?: string;
}

export interface NSWSearchResult {
  title: string;
  url: string;
  decisionDate?: string;
  judge?: string;
  catchwords?: string;
  citation?: string;
}

export interface NSWSearchResponse {
  results: NSWSearchResult[];
  totalResults: number;
  page: number;
  totalPages: number;
}

export async function searchNSWCaseLaw(
  params: NSWSearchParams
): Promise<NSWSearchResponse> {
  const query = new URLSearchParams();

  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.body) query.set("body", params.body);
  if (params.title) query.set("title", params.title);
  if (params.before) query.set("before", params.before);
  if (params.catchwords) query.set("catchwords", params.catchwords);
  if (params.party) query.set("party", params.party);
  if (params.mnc) query.set("mnc", params.mnc);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.fileNumber) query.set("fileNumber", params.fileNumber);
  if (params.legislationCited) query.set("legislationCited", params.legislationCited);
  if (params.casesCited) query.set("casesCited", params.casesCited);
  if (params.sort) query.set("sort", params.sort);

  // Courts and tribunals are repeated params.
  // When none are specified, include ALL (the site requires at least one to return results).
  const courtKeys = params.courts?.length ? params.courts : Object.keys(COURTS);
  const tribunalKeys = params.tribunals?.length ? params.tribunals : Object.keys(TRIBUNALS);

  for (const courtKey of courtKeys) {
    const id = COURTS[courtKey];
    if (id) query.append("courts", id);
  }
  for (const tribKey of tribunalKeys) {
    const id = TRIBUNALS[tribKey];
    if (id) query.append("tribunals", id);
  }

  const url = `${SEARCH_URL}?${query.toString()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml",
      "Referer": `${BASE_URL}/search/advanced`,
    },
  });

  if (!res.ok) {
    throw new Error(`NSW CaseLaw returned ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Extract total results from paginationConfig script
  let totalResults = 0;
  $("script").each((_, el) => {
    const text = $(el).html() || "";
    const match = text.match(/totalElements:\s*(\d+)/);
    if (match) totalResults = parseInt(match[1], 10);
  });

  // Fallback: parse from display text
  if (!totalResults) {
    const displayText = $("h1 small span.hidden-sm").text().trim();
    const match = displayText.match(/of\s+(\d+)/);
    if (match) totalResults = parseInt(match[1], 10);
  }

  const page = params.page ?? 0;
  const totalPages = totalResults > 0 ? Math.ceil(totalResults / PAGE_SIZE) : 0;

  const results: NSWSearchResult[] = [];
  $("div.row.result").each((_, el) => {
    const row = $(el);
    const link = row.find("h4 a");
    const titleText = link.text().trim();
    const href = link.attr("href") || "";

    // Extract catchwords
    const catchwordsEl = row.find(".cntn .hidden-xs.hidden-sm p").last();
    const catchwordsText = catchwordsEl.text().trim();
    // Skip if it's the "Catchwords:" label itself
    const cw = catchwordsText.toLowerCase() === "catchwords:" ? "" : catchwordsText;

    // Extract judge and date from info panel
    const infoItems = row.find(".info .list-group-item");
    let judge = "";
    let decisionDate = "";
    // Items alternate: header, value, header, value
    for (let i = 0; i < infoItems.length - 1; i++) {
      const label = $(infoItems[i]).text().trim().toLowerCase();
      const value = $(infoItems[i + 1]).text().trim();
      if (label.includes("judgment of") || label.includes("before")) {
        judge = value;
      } else if (label.includes("decision date")) {
        decisionDate = value;
      }
    }

    // Try to extract citation from title (e.g. "Smith v Jones [2024] NSWSC 123")
    const citMatch = titleText.match(/\[\d{4}\]\s+\w+\s+\d+/);
    const citation = citMatch ? citMatch[0] : undefined;

    results.push({
      title: decodeEntities(titleText),
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      decisionDate: decisionDate || undefined,
      judge: decodeEntities(judge) || undefined,
      catchwords: decodeEntities(cw) || undefined,
      citation: citation || undefined,
    });
  });

  return { results, totalResults, page, totalPages };
}
