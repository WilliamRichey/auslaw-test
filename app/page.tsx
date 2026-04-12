"use client";

import { useState } from "react";

interface SearchResult {
  title: string;
  neutralCitation?: string;
  reportedCitation?: string;
  url: string;
  summary?: string;
  jurisdiction?: string;
  year?: string;
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

export default function Home() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"ai" | "direct">("ai");
  const [type, setType] = useState<"case" | "legislation">("case");
  const [jurisdiction, setJurisdiction] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [searchParams, setSearchParams] = useState<Record<string, string> | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setResults([]);

    setInterpretation("");
    setSearchParams(null);

    try {
      let data;
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


  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-3xl font-bold text-zinc-900">AusLaw MCP Test</h1>
        <p className="mb-6 text-zinc-500">Search Australian case law and legislation</p>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setMode("ai")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              mode === "ai"
                ? "bg-purple-600 text-white"
                : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
            }`}
          >
            AI Search
          </button>
          <button
            onClick={() => setMode("direct")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              mode === "direct"
                ? "bg-blue-600 text-white"
                : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
            }`}
          >
            Direct Search
          </button>
        </div>

        <form onSubmit={handleSearch} className="mb-8 flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === "ai"
                  ? "Ask a question, e.g. 'Show me recent Federal Court decisions about negligence'"
                  : "Search keywords, e.g. 'negligence duty of care'"
              }
              className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className={`rounded-lg px-6 py-2 font-medium text-white disabled:opacity-50 ${
                mode === "ai"
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
          {mode === "direct" && (
            <div className="flex gap-3">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "case" | "legislation")}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
              >
                <option value="case">Cases</option>
                <option value="legislation">Legislation</option>
              </select>
              <select
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
              >
                {JURISDICTIONS.map((j) => (
                  <option key={j.value} value={j.value}>
                    {j.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {mode === "ai" && (
            <p className="text-sm text-zinc-400">
              Claude interprets your question and sets the right search parameters automatically.
            </p>
          )}
        </form>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">{error}</div>
        )}

        {interpretation && (
          <div className="mb-4 rounded-lg bg-purple-50 p-4">
            <p className="text-sm font-medium text-purple-800">AI interpretation</p>
            <p className="text-sm text-purple-700">{interpretation}</p>
            {searchParams && (
              <p className="mt-1 font-mono text-xs text-purple-500">
                query=&quot;{searchParams.query}&quot; type={searchParams.type} jurisdiction={searchParams.jurisdiction || "all"} court={searchParams.court || "all"} method={searchParams.method}
              </p>
            )}
          </div>
        )}

        {results.length > 0 && (
          <div className="mb-8 space-y-3">
            <h2 className="text-lg font-semibold text-zinc-700">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </h2>
            {results.map((r, i) => (
              <div
                key={i}
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <h3 className="font-semibold text-zinc-900">{r.title}</h3>
                <div className="mt-1 flex flex-wrap gap-2 text-sm text-zinc-500">
                  {r.neutralCitation && (
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                      {r.neutralCitation}
                    </span>
                  )}
                  {r.reportedCitation && (
                    <span className="rounded bg-zinc-100 px-2 py-0.5">
                      {r.reportedCitation}
                    </span>
                  )}
                  {r.jurisdiction && (
                    <span className="uppercase">{r.jurisdiction}</span>
                  )}
                  {r.year && <span>{r.year}</span>}
                </div>
                {r.summary && (
                  <p className="mt-2 text-sm text-zinc-600">{r.summary}</p>
                )}
                <div className="mt-3">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    Open on AustLII
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
