"use client";

import { useState } from "react";

interface SearchResult {
  _score: number;
  descricao: string;
  confidence: number;
  model_used: string;
  source_path: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.results ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-bold">Search Quotes</h1>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Describe what you're looking for…"
          className="flex-1 border border-neutral-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      {results.length > 0 && (
        <ul className="space-y-3">
          {results.map((r, i) => (
            <li key={i} className="border rounded-lg p-4 space-y-1">
              <p className="text-sm">{r.descricao}</p>
              <div className="flex flex-wrap gap-3 text-xs text-neutral-500 mt-2">
                <span>Score: {r._score.toFixed(4)}</span>
                <span>Confidence: {(r.confidence * 100).toFixed(0)}%</span>
                <span>Model: {r.model_used}</span>
                <span className="truncate max-w-xs">Source: {r.source_path}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && results.length === 0 && query && !error && (
        <p className="text-sm text-neutral-400 text-center py-8">No results found.</p>
      )}
    </main>
  );
}
