/**
 * NSW CaseLaw Sync Script
 *
 * Crawls caselaw.nsw.gov.au by court and date range, extracts case metadata
 * (including catchwords), and stores in the local SQLite database.
 *
 * Usage:
 *   npx tsx scripts/nsw-sync.ts                       # Sync 2023+ for all courts
 *   npx tsx scripts/nsw-sync.ts --from 2020           # Sync from 2020
 *   npx tsx scripts/nsw-sync.ts --court supreme        # Specific court only
 *   npx tsx scripts/nsw-sync.ts --tribunals            # Include tribunals
 */

import * as cheerio from "cheerio";
import { upsertCase, logSync, getDb } from "../lib/db";

const BASE_URL = "https://www.caselaw.nsw.gov.au";
const SEARCH_URL = `${BASE_URL}/search/advanced`;
const PAGE_SIZE = 20;
const REQUEST_DELAY_MS = 5_000; // 5 seconds — NSW CaseLaw is less aggressive than AustLII

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface CourtDef {
  key: string;
  id: string;
  code: string;
  label: string;
  type: "court" | "tribunal";
}

const NSW_COURTS: CourtDef[] = [
  { key: "court_of_appeal", id: "54a634063004de94513d8278", code: "NSWCA", label: "Court of Appeal", type: "court" },
  { key: "court_of_criminal_appeal", id: "54a634063004de94513d8279", code: "NSWCCA", label: "Court of Criminal Appeal", type: "court" },
  { key: "supreme", id: "54a634063004de94513d8281", code: "NSWSC", label: "Supreme Court", type: "court" },
  { key: "district", id: "54a634063004de94513d827c", code: "NSWDC", label: "District Court", type: "court" },
  { key: "local", id: "54a634063004de94513d8280", code: "NSWLC", label: "Local Court", type: "court" },
  { key: "lec_judges", id: "54a634063004de94513d8286", code: "NSWLEC", label: "Land & Environment Court (Judges)", type: "court" },
  { key: "lec_commissioners", id: "54a634063004de94513d827f", code: "NSWLECC", label: "Land & Environment Court (Comm.)", type: "court" },
  { key: "childrens", id: "54a634063004de94513d827a", code: "NSWChC", label: "Children's Court", type: "court" },
  { key: "drug", id: "54a634063004de94513d827d", code: "NSWDC-Drug", label: "Drug Court", type: "court" },
];

const NSW_TRIBUNALS: CourtDef[] = [
  { key: "ncat_appeal", id: "54a634063004de94513d828d", code: "NSWCATAP", label: "NCAT (Appeal Panel)", type: "tribunal" },
  { key: "ncat_admin", id: "54a634063004de94513d8289", code: "NSWCATAD", label: "NCAT (Admin & Equal Opp)", type: "tribunal" },
  { key: "ncat_consumer", id: "54a634063004de94513d828b", code: "NSWCATCD", label: "NCAT (Consumer & Commercial)", type: "tribunal" },
  { key: "ncat_guardianship", id: "54a634063004de94513d828c", code: "NSWCATGD", label: "NCAT (Guardianship)", type: "tribunal" },
  { key: "ncat_occupational", id: "54a634063004de94513d828a", code: "NSWCATOD", label: "NCAT (Occupational)", type: "tribunal" },
  { key: "dust_diseases", id: "54a634063004de94513d8283", code: "NSWDDT", label: "Dust Diseases Tribunal", type: "tribunal" },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

interface ParsedResult {
  title: string;
  url: string;
  decisionDate?: string;
  judge?: string;
  catchwords?: string;
  citation?: string;
}

async function fetchSearchPage(
  courtId: string,
  courtType: "court" | "tribunal",
  startDate: string,
  endDate: string,
  page: number
): Promise<{ results: ParsedResult[]; totalResults: number } | null> {
  const params = new URLSearchParams();
  params.set("startDate", startDate);
  params.set("endDate", endDate);
  if (courtType === "court") {
    params.set("courts", courtId);
  } else {
    params.set("tribunals", courtId);
  }
  params.set("page", String(page));

  const url = `${SEARCH_URL}?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for page ${page}`);
      return null;
    }
    const html = await res.text();
    return parseSearchResults(html);
  } catch (err) {
    console.error(`  Fetch error:`, (err as Error).message);
    return null;
  }
}

function parseSearchResults(html: string): { results: ParsedResult[]; totalResults: number } {
  const $ = cheerio.load(html);

  let totalResults = 0;
  $("script").each((_, el) => {
    const text = $(el).html() || "";
    const match = text.match(/totalElements:\s*(\d+)/);
    if (match) totalResults = parseInt(match[1], 10);
  });

  const results: ParsedResult[] = [];
  $("div.row.result").each((_, el) => {
    const row = $(el);
    const link = row.find("h4 a");
    const titleText = link.text().trim();
    const href = link.attr("href") || "";

    const catchwordsEl = row.find(".cntn .hidden-xs.hidden-sm p").last();
    const cwText = catchwordsEl.text().trim();
    const catchwords = cwText.toLowerCase() === "catchwords:" ? "" : cwText;

    const infoItems = row.find(".info .list-group-item");
    let judge = "";
    let decisionDate = "";
    for (let i = 0; i < infoItems.length - 1; i++) {
      const label = $(infoItems[i]).text().trim().toLowerCase();
      const value = $(infoItems[i + 1]).text().trim();
      if (label.includes("judgment of") || label.includes("before")) judge = value;
      else if (label.includes("decision date")) decisionDate = value;
    }

    const citMatch = titleText.match(/\[\d{4}\]\s+\w+\s+\d+/);

    results.push({
      title: titleText,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      decisionDate: decisionDate || undefined,
      judge: judge || undefined,
      catchwords: catchwords || undefined,
      citation: citMatch ? citMatch[0] : undefined,
    });
  });

  return { results, totalResults };
}

async function syncCourt(court: CourtDef, startYear: number, endYear: number): Promise<number> {
  console.log(`\n=== ${court.label} (${court.code}) ===`);
  let totalAdded = 0;

  for (let year = endYear; year >= startYear; year--) {
    const start = formatDate(year, 1, 1);
    const end = formatDate(year, 12, 31);

    await sleep(REQUEST_DELAY_MS);
    const firstPage = await fetchSearchPage(court.id, court.type, start, end, 0);
    if (!firstPage) {
      console.error(`  Failed to fetch ${year} page 0`);
      continue;
    }

    const { results, totalResults } = firstPage;
    const totalPages = Math.ceil(totalResults / PAGE_SIZE);
    console.log(`  ${year}: ${totalResults} cases, ${totalPages} pages`);

    let yearAdded = 0;
    for (const r of results) {
      const citMatch = r.citation?.match(/\[(\d{4})\]/);
      const caseYear = citMatch ? parseInt(citMatch[1], 10) : year;
      const inserted = upsertCase({
        source: "nsw_caselaw",
        jurisdiction: "nsw",
        court_code: court.code,
        title: r.title,
        neutral_citation: r.citation || undefined,
        year: caseYear,
        decision_date: r.decisionDate || undefined,
        catchwords: r.catchwords || undefined,
        url: r.url,
      });
      if (inserted) yearAdded++;
    }

    // Paginate through remaining pages
    for (let page = 1; page < totalPages && page < 50; page++) {
      await sleep(REQUEST_DELAY_MS);
      const pageData = await fetchSearchPage(court.id, court.type, start, end, page);
      if (!pageData || pageData.results.length === 0) break;

      for (const r of pageData.results) {
        const citMatch = r.citation?.match(/\[(\d{4})\]/);
        const caseYear = citMatch ? parseInt(citMatch[1], 10) : year;
        const inserted = upsertCase({
          source: "nsw_caselaw",
          jurisdiction: "nsw",
          court_code: court.code,
          title: r.title,
          neutral_citation: r.citation || undefined,
          year: caseYear,
          decision_date: r.decisionDate || undefined,
          catchwords: r.catchwords || undefined,
          url: r.url,
        });
        if (inserted) yearAdded++;
      }
      console.log(`    page ${page + 1}/${totalPages}: ${pageData.results.length} cases`);
    }

    totalAdded += yearAdded;
    console.log(`  ${year}: ${yearAdded} new cases added`);
  }

  logSync("nsw", court.code, totalAdded, "ok");
  console.log(`  Total new: ${totalAdded}`);
  return totalAdded;
}

async function main() {
  const args = process.argv.slice(2);
  const currentYear = new Date().getFullYear();

  let startYear = 2023;
  let endYear = currentYear;
  let courtFilter: string | null = null;
  let includeTribunals = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) startYear = parseInt(args[i + 1], 10);
    if (args[i] === "--to" && args[i + 1]) endYear = parseInt(args[i + 1], 10);
    if (args[i] === "--court" && args[i + 1]) courtFilter = args[i + 1];
    if (args[i] === "--tribunals") includeTribunals = true;
  }

  let courts: CourtDef[] = [...NSW_COURTS];
  if (includeTribunals) courts = courts.concat(NSW_TRIBUNALS);
  if (courtFilter) courts = courts.filter((c) => c.key === courtFilter || c.code === courtFilter);

  if (courts.length === 0) {
    console.error(`No court found matching "${courtFilter}"`);
    process.exit(1);
  }

  console.log(`NSW CaseLaw Sync`);
  console.log(`Years: ${startYear}-${endYear}`);
  console.log(`Courts: ${courts.map((c) => c.code).join(", ")}`);
  console.log(`Rate limit: ${REQUEST_DELAY_MS / 1000}s between requests`);

  getDb();

  let grandTotal = 0;
  for (const court of courts) {
    const added = await syncCourt(court, startYear, endYear);
    grandTotal += added;
  }

  console.log(`\n=== Done ===`);
  console.log(`Total new cases added: ${grandTotal}`);
  getDb().close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
