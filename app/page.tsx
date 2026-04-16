"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

interface SearchResult {
  title: string;
  neutralCitation?: string;
  reportedCitation?: string;
  url: string;
  summary?: string;
  jurisdiction?: string;
  year?: string;
  // NSW CaseLaw fields
  decisionDate?: string;
  judge?: string;
  catchwords?: string;
  citation?: string;
}

const JURISDICTIONS = [
  { value: "", label: "All jurisdictions" },
  { value: "cth", label: "Commonwealth" },
  { value: "nsw", label: "New South Wales" },
  { value: "vic", label: "Victoria" },
  { value: "qld", label: "Queensland" },
  { value: "sa", label: "South Australia" },
  { value: "wa", label: "Western Australia" },
  { value: "tas", label: "Tasmania" },
  { value: "nt", label: "Northern Territory" },
  { value: "act", label: "ACT" },
  { value: "nz", label: "New Zealand" },
];

const NSW_COURTS = [
  { value: "court_of_appeal", label: "Court of Appeal" },
  { value: "court_of_criminal_appeal", label: "Court of Criminal Appeal" },
  { value: "supreme", label: "Supreme Court" },
  { value: "district", label: "District Court" },
  { value: "local", label: "Local Court" },
  { value: "lec_judges", label: "Land & Environment Court (Judges)" },
  { value: "lec_commissioners", label: "Land & Environment Court (Commissioners)" },
  { value: "childrens", label: "Children's Court" },
  { value: "compensation", label: "Compensation Court" },
  { value: "drug", label: "Drug Court" },
  { value: "industrial", label: "Industrial Court" },
  { value: "irc_judges", label: "IRC (Judges)" },
  { value: "irc_commissioners", label: "IRC (Commissioners)" },
];

const NSW_TRIBUNALS = [
  { value: "ncat_appeal", label: "NCAT (Appeal Panel)" },
  { value: "ncat_admin", label: "NCAT (Admin & Equal Opp)" },
  { value: "ncat_consumer", label: "NCAT (Consumer & Commercial)" },
  { value: "ncat_guardianship", label: "NCAT (Guardianship)" },
  { value: "ncat_occupational", label: "NCAT (Occupational)" },
  { value: "ncat_enforcement", label: "NCAT (Enforcement)" },
  { value: "dust_diseases", label: "Dust Diseases Tribunal" },
  { value: "adt_appeal", label: "ADT (Appeal Panel)" },
  { value: "adt_divisions", label: "ADT (Divisions)" },
  { value: "equal_opportunity", label: "Equal Opportunity Tribunal" },
  { value: "fair_trading", label: "Fair Trading Tribunal" },
  { value: "legal_services", label: "Legal Services Tribunal" },
  { value: "medical", label: "Medical Tribunal" },
  { value: "transport_appeal", label: "Transport Appeal Boards" },
];

const FEATURES = [
  "Case law search across all Australian and NZ jurisdictions",
  "Intelligent search relevance with auto-detection of case names vs topics",
  "Multiple search methods: title, phrase, boolean, proximity",
  "Legislation search with pagination",
  "Citation extraction: neutral and reported citations",
  "AGLC4 citation formatting, validation, and pinpoint generation",
  "jade.io authenticated fetch and search",
  "Authority-based ranking by court hierarchy",
  "Full document retrieval from HTML and PDF sources",
  "OCR fallback for scanned PDFs via Tesseract",
  "SSRF protection and rate limiting",
  "NSW CaseLaw (caselaw.nsw.gov.au) search with court/tribunal filtering",
];

const EXAMPLE_QUERIES = [
  { category: "Constitutional law", query: "Find High Court cases about constitutional implied freedoms" },
  { category: "Legal concepts", query: "What is a sub bailee?" },
  { category: "Procedure & costs", query: "In the NSW UCPR what rule deals with compliance expenses for a subpoena? What do cases say about reasonable compliance expenses?" },
  { category: "Comparing jurisdictions", query: "Compare how Victoria and NSW courts have treated non-compete clauses" },
];

function LoadingSpinner({ mode }: { mode: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-4 border-zinc-200" />
        <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-4 border-transparent border-t-indigo-600" />
      </div>
      <p className="mt-4 text-sm font-medium text-zinc-500 animate-pulse">
        {mode === "nsw" ? "Searching NSW CaseLaw..." : "Searching AustLII via MCP server..."}
      </p>
      {mode === "ai" && (
        <>
          <p className="mt-1 text-xs text-zinc-400">
            AI searches may take 10-30 seconds
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            AustLII will try to block this IP address. I will need to challenge it for access. If this does not work try again in a few minutes or run locally on your server with a different IP.
          </p>
        </>
      )}
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"ai" | "direct" | "nsw">("ai");
  const [type, setType] = useState<"case" | "legislation">("case");
  const [jurisdiction, setJurisdiction] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [searchParams, setSearchParams] = useState<Record<string, string> | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // NSW-specific state
  const [nswSearchField, setNswSearchField] = useState<"body" | "title" | "catchwords" | "party" | "legislationCited" | "casesCited">("body");
  const [nswCourts, setNswCourts] = useState<string[]>([]);
  const [nswTribunals, setNswTribunals] = useState<string[]>([]);
  const [nswTotalResults, setNswTotalResults] = useState(0);
  const [nswPage, setNswPage] = useState(0);
  const [nswTotalPages, setNswTotalPages] = useState(0);

  async function handleSearch(e: React.FormEvent, page?: number) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setResults([]);
    setInterpretation("");
    setSearchParams(null);
    setHasSearched(true);

    try {
      let data;
      if (mode === "nsw") {
        const params = new URLSearchParams();
        params.set(nswSearchField, query);
        if (nswCourts.length > 0) params.set("courts", nswCourts.join(","));
        if (nswTribunals.length > 0) params.set("tribunals", nswTribunals.join(","));
        const p = page ?? 0;
        params.set("page", String(p));

        const res = await fetch(`/api/nsw-search?${params}`);
        if (!res.ok) {
          const text = await res.text();
          setError(`Server error ${res.status}: ${text.slice(0, 200)}`);
          return;
        }
        data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }
        setNswTotalResults(data.totalResults ?? 0);
        setNswPage(data.page ?? 0);
        setNswTotalPages(data.totalPages ?? 0);
        setResults(data.results ?? []);
        if (!data.results?.length) setError("No results found.");
        return;
      } else if (mode === "ai") {
        const res = await fetch("/api/ai-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: query }),
        });
        if (!res.ok) {
          const text = await res.text();
          setError(`Server error ${res.status}: ${text.slice(0, 200)}`);
          return;
        }
        data = await res.json();
        if (data.interpretation) setInterpretation(data.interpretation);
        if (data.searchParams) setSearchParams(data.searchParams);
      } else {
        const params = new URLSearchParams({ query, type });
        if (jurisdiction) params.set("jurisdiction", jurisdiction);
        const res = await fetch(`/api/search?${params}`);
        if (!res.ok) {
          const text = await res.text();
          setError(`Server error ${res.status}: ${text.slice(0, 200)}`);
          return;
        }
        data = await res.json();
      }

      if (data.error) {
        setError(data.error);
      } else {
        setResults(data.results ?? []);
        if (!data.results?.length) setError("No results found.");
      }
    } catch (err) {
      setError(`Request failed: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  function handleExampleClick(exampleQuery: string) {
    setQuery(exampleQuery);
    setMode("ai");
  }

  function toggleNswCourt(key: string) {
    setNswCourts((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function toggleNswTribunal(key: string) {
    setNswTribunals((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-sm">
              WR
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">WilRic Law MCP Test</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Search section */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setMode("ai")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                mode === "ai"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              AI Search
            </button>
            <button
              onClick={() => setMode("direct")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                mode === "direct"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              AustLII Direct
            </button>
            <button
              onClick={() => setMode("nsw")}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                mode === "nsw"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              NSW CaseLaw
            </button>
          </div>

          <form onSubmit={handleSearch} className="flex flex-col gap-3">
            <div className="flex gap-3">
              {mode === "nsw" && (
                <select
                  value={nswSearchField}
                  onChange={(e) => setNswSearchField(e.target.value as typeof nswSearchField)}
                  className="rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="body">Full text</option>
                  <option value="title">Case name</option>
                  <option value="catchwords">Catchwords</option>
                  <option value="party">Party name</option>
                  <option value="legislationCited">Legislation cited</option>
                  <option value="casesCited">Cases cited</option>
                </select>
              )}
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  mode === "ai"
                    ? "Ask a question, e.g. 'Show me recent Federal Court decisions about negligence'"
                    : mode === "nsw"
                    ? "Search NSW CaseLaw, e.g. 'negligence duty of care'"
                    : "Search keywords, e.g. 'negligence duty of care'"
                }
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Searching
                  </span>
                ) : "Search"}
              </button>
            </div>

            {mode === "direct" && (
              <div className="flex gap-3">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as "case" | "legislation")}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="case">Cases</option>
                  <option value="legislation">Legislation</option>
                </select>
                <select
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  {JURISDICTIONS.map((j) => (
                    <option key={j.value} value={j.value}>
                      {j.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {mode === "nsw" && (
              <div className="space-y-2">
                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
                    Filter by court/tribunal
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Courts</p>
                      {NSW_COURTS.map((c) => (
                        <label key={c.value} className="flex items-center gap-1.5 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={nswCourts.includes(c.value)}
                            onChange={() => toggleNswCourt(c.value)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {c.label}
                        </label>
                      ))}
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tribunals</p>
                      {NSW_TRIBUNALS.map((t) => (
                        <label key={t.value} className="flex items-center gap-1.5 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={nswTribunals.includes(t.value)}
                            onChange={() => toggleNswTribunal(t.value)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </details>
                <p className="text-xs text-slate-400">
                  Searches caselaw.nsw.gov.au directly. Leave court/tribunal filters empty to search all.
                </p>
              </div>
            )}

            {mode === "ai" && (
              <p className="text-xs text-slate-400">
                Claude interprets your question, selects the right MCP tools, and summarises the results.
              </p>
            )}
          </form>
        </div>

        {/* Loading state */}
        {loading && <LoadingSpinner mode={mode} />}

        {/* Error */}
        {error && !loading && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Search params */}
        {searchParams && !loading && (
          <div className="mt-6 rounded-lg bg-slate-100 px-4 py-2">
            <p className="font-mono text-xs text-slate-500">
              tool={searchParams.tool || "search_cases"} query=&quot;{searchParams.query}&quot; jurisdiction={searchParams.jurisdiction || "all"} method={searchParams.method}
            </p>
          </div>
        )}

        {/* NSW results count + pagination */}
        {mode === "nsw" && nswTotalResults > 0 && !loading && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {nswTotalResults.toLocaleString()} result{nswTotalResults !== 1 ? "s" : ""} found
              {nswTotalPages > 1 && ` — page ${nswPage + 1} of ${nswTotalPages}`}
            </p>
            {nswTotalPages > 1 && (
              <div className="flex gap-2">
                <button
                  disabled={nswPage === 0}
                  onClick={(e) => { setNswPage(nswPage - 1); handleSearch(e, nswPage - 1); }}
                  className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  disabled={nswPage >= nswTotalPages - 1}
                  onClick={(e) => { setNswPage(nswPage + 1); handleSearch(e, nswPage + 1); }}
                  className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* AI Summary */}
        {interpretation && !loading && (
          <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/50 p-6">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-[10px] font-bold text-white">AI</div>
              <p className="text-sm font-semibold text-indigo-800">Summary</p>
            </div>
            <div className="prose prose-sm max-w-none text-slate-700 prose-strong:text-slate-900 prose-headings:text-slate-900 prose-li:my-0.5">
              <ReactMarkdown>{interpretation}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && !loading && (
          <div className="mt-6 space-y-3">
            {mode !== "nsw" && (
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </h2>
            )}
            {results.map((r, i) => (
              <div
                key={i}
                className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">
                    {r.title}
                  </h3>
                </a>
                <div className="mt-1.5 flex flex-wrap gap-2 text-sm">
                  {(r.neutralCitation || r.citation) && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                      {r.neutralCitation || r.citation}
                    </span>
                  )}
                  {r.reportedCitation && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {r.reportedCitation}
                    </span>
                  )}
                  {r.jurisdiction && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium uppercase text-emerald-700">
                      {r.jurisdiction}
                    </span>
                  )}
                  {r.decisionDate && (
                    <span className="text-xs text-slate-400">{r.decisionDate}</span>
                  )}
                  {r.year && !r.decisionDate && (
                    <span className="text-xs text-slate-400">{r.year}</span>
                  )}
                  {r.judge && (
                    <span className="text-xs text-slate-400">Before: {r.judge}</span>
                  )}
                </div>
                {r.catchwords && (
                  <p className="mt-2 text-sm text-slate-500 line-clamp-2">{r.catchwords}</p>
                )}
                {r.summary && !r.catchwords && (
                  <p className="mt-2 text-sm text-slate-500">{r.summary}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Features + examples — show when no search has been made */}
        {!hasSearched && !loading && (
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            {/* Example queries */}
            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Try asking
              </h2>
              <div className="space-y-2">
                {EXAMPLE_QUERIES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => handleExampleClick(ex.query)}
                    className="group block w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-all hover:border-indigo-300 hover:shadow-sm"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {ex.category}
                    </span>
                    <p className="mt-0.5 text-sm text-slate-700 group-hover:text-indigo-700">
                      &ldquo;{ex.query}&rdquo;
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Features */}
            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
                MCP Server Features
              </h2>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <ul className="space-y-2.5">
                  {FEATURES.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] text-emerald-600">
                        &#10003;
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
