"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

interface SearchResult {
  title: string;
  url: string;
  decisionDate?: string;
  decision_date?: string;
  judge?: string;
  catchwords?: string;
  citation?: string;
  neutral_citation?: string;
  jurisdiction?: string;
  court?: string;
  court_code?: string;
  year?: number;
  source?: string;
}

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

function LoadingSpinner({ mode }: { mode: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-4 border-zinc-200" />
        <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-4 border-transparent border-t-indigo-600" />
      </div>
      <p className="mt-4 text-sm font-medium text-zinc-500 animate-pulse">
        {mode === "ai" ? "Searching NSW CaseLaw with AI..." : "Searching NSW CaseLaw..."}
      </p>
      {mode === "ai" && (
        <p className="mt-1 text-xs text-zinc-400">
          AI searches may take 10-30 seconds
        </p>
      )}
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"ai" | "direct">("ai");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  // Direct search state
  const [searchField, setSearchField] = useState<"body" | "title" | "catchwords" | "party" | "legislationCited" | "casesCited">("body");
  const [courts, setCourts] = useState<string[]>([]);
  const [tribunals, setTribunals] = useState<string[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  async function handleSearch(e: React.FormEvent, p?: number) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setResults([]);
    setInterpretation("");
    setHasSearched(true);

    try {
      if (mode === "ai") {
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
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }
        if (data.interpretation) setInterpretation(data.interpretation);
        setResults(data.results ?? []);
        if (!data.results?.length && !data.interpretation) setError("No results found.");
      } else {
        const params = new URLSearchParams();
        params.set(searchField, query);
        if (courts.length > 0) params.set("courts", courts.join(","));
        if (tribunals.length > 0) params.set("tribunals", tribunals.join(","));
        params.set("page", String(p ?? 0));

        const res = await fetch(`/api/nsw-search?${params}`);
        if (!res.ok) {
          const text = await res.text();
          setError(`Server error ${res.status}: ${text.slice(0, 200)}`);
          return;
        }
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }
        setTotalResults(data.totalResults ?? 0);
        setPage(data.page ?? 0);
        setTotalPages(data.totalPages ?? 0);
        setResults(data.results ?? []);
        if (!data.results?.length) setError("No results found.");
      }
    } catch (err) {
      setError(`Request failed: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  function toggleCourt(key: string) {
    setCourts((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function toggleTribunal(key: string) {
    setTribunals((prev) =>
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
              <h1 className="text-xl font-bold text-slate-900">Australian Legal Research</h1>
              <p className="text-xs text-slate-400">NSW CaseLaw + AustLII</p>
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
              Direct Search
            </button>
          </div>

          <form onSubmit={handleSearch} className="flex flex-col gap-3">
            <div className="flex gap-3">
              {mode === "direct" && (
                <select
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value as typeof searchField)}
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
                    ? "Ask a question, e.g. 'Is a judge able to overturn another judge's case management orders?'"
                    : "Search NSW CaseLaw, e.g. 'negligence duty of care'"
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
              <>
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
                            checked={courts.includes(c.value)}
                            onChange={() => toggleCourt(c.value)}
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
                            checked={tribunals.includes(t.value)}
                            onChange={() => toggleTribunal(t.value)}
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
              </>
            )}

            {mode === "ai" && (
              <p className="text-xs text-slate-400">
                Claude interprets your question, searches NSW CaseLaw, and summarises the results.
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

        {/* Direct search results count + pagination */}
        {mode === "direct" && totalResults > 0 && !loading && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {totalResults.toLocaleString()} result{totalResults !== 1 ? "s" : ""} found
              {totalPages > 1 && ` — page ${page + 1} of ${totalPages}`}
            </p>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={(e) => { setPage(page - 1); handleSearch(e, page - 1); }}
                  className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={(e) => { setPage(page + 1); handleSearch(e, page + 1); }}
                  className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && !loading && (
          <div className="mt-4 space-y-3">
            {mode === "ai" && (
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {results.length} case{results.length !== 1 ? "s" : ""} found
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
                  {(r.citation || r.neutral_citation) && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                      {r.citation || r.neutral_citation}
                    </span>
                  )}
                  {r.jurisdiction && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium uppercase text-emerald-700">
                      {r.jurisdiction}
                    </span>
                  )}
                  {(r.court || r.court_code) && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {r.court || r.court_code}
                    </span>
                  )}
                  {(r.decisionDate || r.decision_date) && (
                    <span className="text-xs text-slate-400">{r.decisionDate || r.decision_date}</span>
                  )}
                  {!r.decisionDate && !r.decision_date && r.year && (
                    <span className="text-xs text-slate-400">{r.year}</span>
                  )}
                  {r.judge && (
                    <span className="text-xs text-slate-400">Before: {r.judge}</span>
                  )}
                  {r.source === "austlii" && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">AustLII</span>
                  )}
                </div>
                {r.catchwords && (
                  <p className="mt-2 text-sm text-slate-500 line-clamp-2">{r.catchwords}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!hasSearched && !loading && (
          <div className="mt-10 text-center text-sm text-slate-400">
            <p>Search decisions from NSW courts and tribunals.</p>
            <p className="mt-1">Try searching for a topic, case name, party, or legislation.</p>
          </div>
        )}
      </main>
    </div>
  );
}
