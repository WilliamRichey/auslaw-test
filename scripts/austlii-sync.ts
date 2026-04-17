/**
 * AustLII Sync Script
 *
 * Crawls AustLII TOC pages for configured courts, extracts case metadata,
 * and stores it in a local SQLite database.
 *
 * Usage:
 *   npx tsx scripts/austlii-sync.ts                  # Sync recent years (2023+)
 *   npx tsx scripts/austlii-sync.ts --from 2020      # Sync from 2020
 *   npx tsx scripts/austlii-sync.ts --from 2000 --to 2010  # Specific range
 *   npx tsx scripts/austlii-sync.ts --court HCA       # Specific court only
 */

import * as cheerio from "cheerio";
import { upsertCase, logSync, getDb } from "../lib/db";
import {
  AUSTLII_COURTS,
  DEFAULT_START_YEAR,
  DEFAULT_END_YEAR,
  REQUEST_DELAY_MS,
  type CourtConfig,
} from "./sync-config";

const BASE_URL = "https://www.austlii.edu.au";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://www.austlii.edu.au/",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      redirect: "follow",
    });
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`  Fetch error for ${url}:`, (err as Error).message);
    return null;
  }
}

interface ParsedCase {
  title: string;
  neutralCitation: string | null;
  year: number | null;
  decisionDate: string | null;
  url: string;
  path: string;
}

function parseTocPage(html: string, courtConfig: CourtConfig): ParsedCase[] {
  const $ = cheerio.load(html);
  const cases: ParsedCase[] = [];

  // Case links are in <li> elements with <a> tags pointing to viewdoc
  $("li a[href*='/viewdoc/'], li a[href*='/cases/']").each((_, el) => {
    const link = $(el);
    const href = link.attr("href") || "";
    const text = link.text().trim();

    // Skip non-case links (year directories, navigation, etc.)
    if (!text || href.endsWith("/") || !text.includes("[")) return;

    // Parse: "Title [Year] Court Number (Date)"
    const citMatch = text.match(/\[(\d{4})\]\s+\w+\s+\d+/);
    const dateMatch = text.match(/\(([^)]+)\)\s*$/);

    const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    cases.push({
      title: text.replace(/\s*\([^)]*\)\s*$/, "").trim(), // Remove trailing date
      neutralCitation: citMatch ? citMatch[0] : null,
      year: citMatch ? parseInt(citMatch[1], 10) : null,
      decisionDate: dateMatch ? dateMatch[1] : null,
      url: fullUrl,
      path: href,
    });
  });

  return cases;
}

function parseYearLinks(html: string): number[] {
  const $ = cheerio.load(html);
  const years: number[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/^(\d{4})\/$/);
    if (match) years.push(parseInt(match[1], 10));
  });

  return years.sort((a, b) => b - a); // Most recent first
}

async function syncCourt(
  court: CourtConfig,
  startYear: number,
  endYear: number
): Promise<number> {
  console.log(`\n=== ${court.label} (${court.court}) ===`);

  // First fetch the main TOC page to get year links and recent cases
  const tocUrl = `${BASE_URL}/cgi-bin/viewtoc/${court.path}/`;
  console.log(`  Fetching TOC: ${tocUrl}`);
  const tocHtml = await fetchPage(tocUrl);
  if (!tocHtml) {
    logSync(court.jurisdiction, court.court, 0, "error", "Failed to fetch TOC page");
    return 0;
  }

  // Parse cases listed directly on the main TOC page (most recent)
  let totalAdded = 0;
  const mainCases = parseTocPage(tocHtml, court);
  console.log(`  Found ${mainCases.length} cases on main TOC page`);

  for (const c of mainCases) {
    const inserted = upsertCase({
      source: "austlii",
      jurisdiction: court.jurisdiction,
      court_code: court.court,
      title: c.title,
      neutral_citation: c.neutralCitation || undefined,
      year: c.year || undefined,
      decision_date: c.decisionDate || undefined,
      url: c.url,
      austlii_path: c.path,
    });
    if (inserted) totalAdded++;
  }

  // Get year links and crawl each year in range
  const availableYears = parseYearLinks(tocHtml);
  const yearsToSync = availableYears.filter((y) => y >= startYear && y <= endYear);
  console.log(`  Years to sync: ${yearsToSync.join(", ") || "none"}`);

  for (const year of yearsToSync) {
    await sleep(REQUEST_DELAY_MS);

    const yearUrl = `${BASE_URL}/cgi-bin/viewtoc/${court.path}/${year}/`;
    console.log(`  Fetching ${year}: ${yearUrl}`);
    const yearHtml = await fetchPage(yearUrl);
    if (!yearHtml) {
      console.error(`  Failed to fetch year ${year}`);
      continue;
    }

    const yearCases = parseTocPage(yearHtml, court);
    let yearAdded = 0;
    for (const c of yearCases) {
      const inserted = upsertCase({
        source: "austlii",
        jurisdiction: court.jurisdiction,
        court_code: court.court,
        title: c.title,
        neutral_citation: c.neutralCitation || undefined,
        year: c.year || year,
        decision_date: c.decisionDate || undefined,
        url: c.url,
        austlii_path: c.path,
      });
      if (inserted) yearAdded++;
    }
    totalAdded += yearAdded;
    console.log(`  ${year}: ${yearCases.length} cases found, ${yearAdded} new`);
  }

  logSync(court.jurisdiction, court.court, totalAdded, "ok");
  console.log(`  Total new cases added: ${totalAdded}`);
  return totalAdded;
}

async function main() {
  const args = process.argv.slice(2);

  let startYear = DEFAULT_START_YEAR;
  let endYear = DEFAULT_END_YEAR;
  let courtFilter: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) startYear = parseInt(args[i + 1], 10);
    if (args[i] === "--to" && args[i + 1]) endYear = parseInt(args[i + 1], 10);
    if (args[i] === "--court" && args[i + 1]) courtFilter = args[i + 1];
  }

  const courts = courtFilter
    ? AUSTLII_COURTS.filter((c) => c.court === courtFilter)
    : AUSTLII_COURTS;

  if (courts.length === 0) {
    console.error(`No court found matching "${courtFilter}"`);
    process.exit(1);
  }

  console.log(`AustLII Sync`);
  console.log(`Years: ${startYear}-${endYear}`);
  console.log(`Courts: ${courts.map((c) => c.court).join(", ")}`);
  console.log(`Rate limit: ${REQUEST_DELAY_MS / 1000}s between requests`);

  // Ensure DB is initialized
  getDb();

  let grandTotal = 0;
  for (const court of courts) {
    const added = await syncCourt(court, startYear, endYear);
    grandTotal += added;
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\n=== Done ===`);
  console.log(`Total new cases added: ${grandTotal}`);

  // Close db
  getDb().close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
