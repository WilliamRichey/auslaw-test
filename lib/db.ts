import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.AUSLAW_DB_PATH || path.join(process.cwd(), "data", "auslaw.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'austlii',
      jurisdiction TEXT,
      court_code TEXT,
      title TEXT NOT NULL,
      neutral_citation TEXT,
      year INTEGER,
      decision_date TEXT,
      catchwords TEXT,
      url TEXT NOT NULL UNIQUE,
      austlii_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cases_jurisdiction ON cases(jurisdiction);
    CREATE INDEX IF NOT EXISTS idx_cases_court_code ON cases(court_code);
    CREATE INDEX IF NOT EXISTS idx_cases_year ON cases(year);
    CREATE INDEX IF NOT EXISTS idx_cases_url ON cases(url);

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jurisdiction TEXT NOT NULL,
      court_code TEXT NOT NULL,
      synced_at TEXT DEFAULT (datetime('now')),
      cases_added INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ok',
      error_message TEXT
    );
  `);

  // Create FTS5 table if it doesn't exist
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS cases_fts USING fts5(
        title, neutral_citation, catchwords, court_code, jurisdiction,
        content=cases,
        content_rowid=id
      );
    `);
  } catch {
    // FTS table already exists or FTS5 not available
  }

  // Create triggers for FTS sync (ignore errors if they already exist)
  const triggers = [
    `CREATE TRIGGER IF NOT EXISTS cases_ai AFTER INSERT ON cases BEGIN
      INSERT INTO cases_fts(rowid, title, neutral_citation, catchwords, court_code, jurisdiction)
      VALUES (new.id, new.title, new.neutral_citation, new.catchwords, new.court_code, new.jurisdiction);
    END`,
    `CREATE TRIGGER IF NOT EXISTS cases_au AFTER UPDATE ON cases BEGIN
      INSERT INTO cases_fts(cases_fts, rowid, title, neutral_citation, catchwords, court_code, jurisdiction)
      VALUES ('delete', old.id, old.title, old.neutral_citation, old.catchwords, old.court_code, old.jurisdiction);
      INSERT INTO cases_fts(rowid, title, neutral_citation, catchwords, court_code, jurisdiction)
      VALUES (new.id, new.title, new.neutral_citation, new.catchwords, new.court_code, new.jurisdiction);
    END`,
    `CREATE TRIGGER IF NOT EXISTS cases_ad AFTER DELETE ON cases BEGIN
      INSERT INTO cases_fts(cases_fts, rowid, title, neutral_citation, catchwords, court_code, jurisdiction)
      VALUES ('delete', old.id, old.title, old.neutral_citation, old.catchwords, old.court_code, old.jurisdiction);
    END`,
  ];
  for (const trigger of triggers) {
    try { db.exec(trigger); } catch { /* already exists */ }
  }

  return db;
}

export interface CaseRecord {
  id?: number;
  source: string;
  jurisdiction: string;
  court_code: string;
  title: string;
  neutral_citation?: string;
  year?: number;
  decision_date?: string;
  catchwords?: string;
  url: string;
  austlii_path?: string;
}

export function upsertCase(c: CaseRecord): boolean {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO cases (source, jurisdiction, court_code, title, neutral_citation, year, decision_date, catchwords, url, austlii_path)
    VALUES (@source, @jurisdiction, @court_code, @title, @neutral_citation, @year, @decision_date, @catchwords, @url, @austlii_path)
    ON CONFLICT(url) DO UPDATE SET
      title = excluded.title,
      neutral_citation = excluded.neutral_citation,
      catchwords = COALESCE(excluded.catchwords, catchwords),
      decision_date = COALESCE(excluded.decision_date, decision_date),
      updated_at = datetime('now')
  `);
  const result = stmt.run({
    source: c.source,
    jurisdiction: c.jurisdiction,
    court_code: c.court_code,
    title: c.title,
    neutral_citation: c.neutral_citation || null,
    year: c.year || null,
    decision_date: c.decision_date || null,
    catchwords: c.catchwords || null,
    url: c.url,
    austlii_path: c.austlii_path || null,
  });
  return result.changes > 0;
}

export interface SearchOptions {
  query: string;
  jurisdiction?: string;
  court?: string;
  yearFrom?: number;
  yearTo?: number;
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  results: CaseRecord[];
  totalResults: number;
  page: number;
  totalPages: number;
}

export function searchCases(opts: SearchOptions): SearchResult {
  const db = getDb();
  const pageSize = opts.pageSize || 20;
  const page = opts.page || 0;
  const offset = page * pageSize;

  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  // FTS match
  if (opts.query) {
    // Escape special FTS5 characters and build query
    const ftsQuery = opts.query
      .replace(/['"]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `"${w}"`)
      .join(" ");
    conditions.push("cases_fts MATCH @query");
    params.query = ftsQuery;
  }

  if (opts.jurisdiction) {
    conditions.push("c.jurisdiction = @jurisdiction");
    params.jurisdiction = opts.jurisdiction;
  }

  if (opts.court) {
    conditions.push("c.court_code = @court");
    params.court = opts.court;
  }

  if (opts.yearFrom) {
    conditions.push("c.year >= @yearFrom");
    params.yearFrom = opts.yearFrom;
  }

  if (opts.yearTo) {
    conditions.push("c.year <= @yearTo");
    params.yearTo = opts.yearTo;
  }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  // Count query
  const countSql = opts.query
    ? `SELECT COUNT(*) as cnt FROM cases_fts JOIN cases c ON cases_fts.rowid = c.id ${where}`
    : `SELECT COUNT(*) as cnt FROM cases c ${where}`;
  const countRow = db.prepare(countSql).get(params) as { cnt: number };
  const totalResults = countRow.cnt;

  // Results query
  const selectSql = opts.query
    ? `SELECT c.* FROM cases_fts JOIN cases c ON cases_fts.rowid = c.id ${where} ORDER BY bm25(cases_fts) LIMIT @limit OFFSET @offset`
    : `SELECT c.* FROM cases c ${where} ORDER BY c.year DESC, c.id DESC LIMIT @limit OFFSET @offset`;

  const rows = db.prepare(selectSql).all({
    ...params,
    limit: pageSize,
    offset,
  }) as CaseRecord[];

  return {
    results: rows,
    totalResults,
    page,
    totalPages: Math.ceil(totalResults / pageSize),
  };
}

export function logSync(jurisdiction: string, courtCode: string, casesAdded: number, status: string, errorMessage?: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO sync_log (jurisdiction, court_code, cases_added, status, error_message)
    VALUES (@jurisdiction, @courtCode, @casesAdded, @status, @errorMessage)
  `).run({ jurisdiction, courtCode, casesAdded, status, errorMessage: errorMessage || null });
}

export function getCaseCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as cnt FROM cases").get() as { cnt: number };
  return row.cnt;
}

export function getCourtCounts(): { court_code: string; jurisdiction: string; count: number }[] {
  const db = getDb();
  return db.prepare(`
    SELECT court_code, jurisdiction, COUNT(*) as count
    FROM cases
    GROUP BY court_code, jurisdiction
    ORDER BY count DESC
  `).all() as { court_code: string; jurisdiction: string; count: number }[];
}
