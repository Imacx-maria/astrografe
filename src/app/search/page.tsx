"use client";

import { useState, useMemo } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface LineItem {
  descricao: string;
  medida?: string | null;
  quant: string;
  preco_unit: string;
}

interface SearchResult {
  _id: string;
  descricao: string;
  line_items: LineItem[];
  quote_date: string | null;
  orc_number: string | null;
  source_path: string | null;
}

interface FlatRow {
  _id: string;
  orc: string;
  date: string;
  descricao: string;
  medida: string;
  quant: string;
  preco_unit: string;
}

type SortKey = "orc" | "date" | "descricao" | "medida" | "quant" | "preco_unit";
type SortDir = "asc" | "desc";

// Regex fallback: extract first measurement from a description string
function extractMedida(text: string): string {
  // Dimension: "12.5 x 13 cm", "24.5X24.5", "1,9 x 1,8 m", "187 x 293cm"
  const dim = text.match(
    /(\d+[.,]?\d*)\s*[xX×]\s*(\d+[.,]?\d*)\s*(cm|mm|m\b|ft\.?|pol\.?)?/i
  );
  if (dim) {
    const unit = dim[3] ? " " + dim[3].replace(/\.$/, "").toLowerCase() : "";
    return `${dim[1]} x ${dim[2]}${unit}`.trim();
  }
  // Paper format: A3, A4, A5, A0, A1, A2
  const paper = text.match(/\b(A[0-5])\b/i);
  if (paper) return paper[1].toUpperCase();
  return "—";
}

function getOrc(r: SearchResult) {
  if (r.orc_number) return r.orc_number;
  if (r.source_path) {
    const m = r.source_path.match(/ORC_(\d{5,9}-\d+)/);
    return m ? `ORC_${m[1]}` : r.source_path;
  }
  return "—";
}

function getDate(r: SearchResult) {
  if (r.quote_date) return r.quote_date;
  if (r.source_path) {
    const m = r.source_path.match(/^(\d{4})(\d{2})(\d{2})_/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "—";
  }
  return "—";
}

function rankByRelevance(results: SearchResult[], query: string): SearchResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return results;
  return [...results].sort((a, b) => {
    const scoreA = words.filter((w) => a.descricao.toLowerCase().includes(w)).length;
    const scoreB = words.filter((w) => b.descricao.toLowerCase().includes(w)).length;
    return scoreB - scoreA;
  });
}

// "IDEM" rows reference the previous distinct item in the same quote.
// Propagate the first real description so rows stay meaningful when sorted.
function resolveIdem(items: LineItem[], fallbackDescricao: string): { descricao: string; medida: string | null | undefined; quant: string; preco_unit: string }[] {
  const isIdemStr = (s: string) => /^\s*ide\s*m\s*$/i.test(s);
  const firstReal = items.find((item) => !isIdemStr(item.descricao));
  const baseDescricao = firstReal?.descricao ?? fallbackDescricao;
  const baseMedida = firstReal ? (firstReal.medida ?? extractMedida(firstReal.descricao)) : extractMedida(fallbackDescricao);
  return items.map((item) => {
    const isIdem = isIdemStr(item.descricao);
    const descricao = isIdem ? baseDescricao : item.descricao;
    const medida = isIdem ? baseMedida : (item.medida ?? extractMedida(item.descricao));
    return { descricao, medida, quant: item.quant, preco_unit: item.preco_unit };
  });
}

function flattenResults(results: SearchResult[], query: string): FlatRow[] {
  const ranked = rankByRelevance(results, query);
  const rows: FlatRow[] = [];
  for (const r of ranked) {
    if (!r.line_items || r.line_items.length === 0) continue;
    const orc = getOrc(r);
    const date = getDate(r);
    for (const item of resolveIdem(r.line_items, r.descricao)) {
      rows.push({ _id: r._id, orc, date, descricao: item.descricao, medida: item.medida ?? "—", quant: item.quant, preco_unit: item.preco_unit });
    }
  }
  return rows;
}

function sortRows(rows: FlatRow[], key: SortKey, dir: SortDir): FlatRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key] ?? "";
    const bv = b[key] ?? "";
    const cmp = av.localeCompare(bv, "pt", { numeric: true, sensitivity: "base" });
    return dir === "asc" ? cmp : -cmp;
  });
}

interface SortableThProps {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  align?: "left" | "right";
  onClick: (key: SortKey) => void;
}

function SortableTh({ label, sortKey, currentKey, currentDir, align = "left", onClick }: SortableThProps) {
  const isActive = currentKey === sortKey;
  return (
    <th
      className={cn("px-4 py-2 cursor-pointer select-none", align === "right" ? "text-right" : "text-left")}
      onClick={() => onClick(sortKey)}
    >
      <div className={cn("flex items-center gap-1", align === "right" ? "justify-end" : "justify-start")}>
        <span>{label}</span>
        <span className="inline-block w-3 h-3 ml-1 flex-shrink-0">
          {isActive ? (
            currentDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          ) : null}
        </span>
      </div>
    </th>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const rows = useMemo(() => {
    const flat = flattenResults(results, query);
    return sortRows(flat, sortKey, sortDir);
  }, [results, query, sortKey, sortDir]);

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-2xl">Search Quotes</h1>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. expositor 10x15, bandeiras couché…"
          className="flex-1 border border-border px-4 py-2 text-sm bg-input text-foreground placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:opacity-90"
        >
          {loading ? "A pesquisar…" : "Pesquisar"}
        </button>
      </form>

      {error && (
        <p className="text-sm text-status-error bg-status-error-muted border border-status-error px-4 py-2">
          {error}
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <SortableTh label="ORC" sortKey="orc" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortableTh label="Data" sortKey="date" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortableTh label="Descrição" sortKey="descricao" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortableTh label="Medida" sortKey="medida" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortableTh label="Quant." sortKey="quant" currentKey={sortKey} currentDir={sortDir} align="right" onClick={handleSort} />
                <SortableTh label="Preço Unit." sortKey="preco_unit" currentKey={sortKey} currentDir={sortDir} align="right" onClick={handleSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row._id}-${i}`} className="imx-border-b">
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{row.orc}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{row.date}</td>
                  <td className="px-4 py-2">{row.descricao}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{row.medida}</td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{row.quant}</td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{row.preco_unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length === 0 && query && !error && (
        <p className="text-sm text-muted-foreground text-center py-8">Sem resultados.</p>
      )}
    </main>
  );
}
