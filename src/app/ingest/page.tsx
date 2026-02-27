"use client";

import { useRef, useState } from "react";
import { FolderOpen } from "lucide-react";

type FileStatus = "queued" | "processing" | "done" | "error" | "duplicate";

interface LineItem {
  descricao: string;
  quant: string;
  preco_unit: string;
}

interface QueueItem {
  id: string;
  name: string;
  status: FileStatus;
  descricao?: string;
  line_items?: LineItem[];
  error?: string;
}

const STATUS_LABEL: Record<FileStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  done: "Done",
  error: "Error",
  duplicate: "Duplicate",
};

const STATUS_COLORS: Record<FileStatus, string> = {
  queued:     "bg-muted text-muted-foreground",
  processing: "bg-status-info-muted text-status-info-foreground",
  done:       "bg-status-success-muted text-status-success-foreground",
  error:      "bg-status-error-muted text-status-error-foreground",
  duplicate:  "bg-primary text-primary-foreground",
};

const SUPPORTED_EXT = new Set(["pdf", "txt", "eml", "msg"]);

export default function IngestPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const updateItem = (id: string, patch: Partial<QueueItem>) =>
    setQueue((q) =>
      q.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );

  const extractText = async (file: File): Promise<string> => {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url
      ).toString();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      }
      return pages.join("\n");
    }
    return file.text();
  };

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const newItems: QueueItem[] = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      status: "queued",
    }));
    setQueue((q) => [...q, ...newItems]);

    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      const file = files[i];
      updateItem(item.id, { status: "processing" });

      try {
        const raw_text = await extractText(file);
        const source_type = file.name.split(".").pop()?.toLowerCase() ?? "txt";

        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_path: file.name, source_type, raw_text }),
        });

        const data = await res.json();
        if (res.status === 409) {
          updateItem(item.id, { status: "duplicate", descricao: `Already ingested (${data.orc_number})` });
          continue;
        }
        if (!res.ok) throw new Error(data.error ?? "Unknown error");

        updateItem(item.id, { status: "done", descricao: data.descricao, line_items: data.line_items ?? [] });
      } catch (err) {
        updateItem(item.id, { status: "error", error: (err as Error).message });
      }
    }
  };

  const handleFileInput = (files: FileList | null) => {
    if (!files) return;
    processFiles(Array.from(files));
  };

  const handleFolderInput = (files: FileList | null) => {
    if (!files) return;
    // Filter to supported extensions only (webkitdirectory ignores accept attr)
    const filtered = Array.from(files).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return SUPPORTED_EXT.has(ext);
    });
    processFiles(filtered);
  };

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-2xl">Ingest Documents</h1>

      {/* Drop zone — unchanged */}
      <div
        className="border-2 border-dashed border-border p-10 text-center cursor-pointer hover:border-primary transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFileInput(e.dataTransfer.files);
        }}
      >
        <p className="text-muted-foreground">Drop files here or click to select</p>
        <p className="text-xs text-muted-foreground mt-1">Supports TXT, EML, PDF text</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.eml,.pdf,.msg"
          className="hidden"
          onChange={(e) => handleFileInput(e.target.files)}
        />
      </div>

      {/* Folder upload */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => folderInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
        >
          <FolderOpen className="h-4 w-4" />
          Choose Folder
        </button>
        <span className="text-xs text-muted-foreground">
          Selects all PDF, TXT, EML and MSG files inside a folder
        </span>
        {/* webkitdirectory is non-standard — cast via data-attr trick */}
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          // @ts-expect-error webkitdirectory is non-standard but universally supported
          webkitdirectory=""
          onChange={(e) => handleFolderInput(e.target.files)}
        />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <ul className="space-y-2">
          {queue.map((item) => (
            <li key={item.id} className="flex items-start gap-3 text-sm imx-border p-3">
              <span className={`px-2 py-0.5 text-xs shrink-0 ${STATUS_COLORS[item.status]}`}>
                {STATUS_LABEL[item.status]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate">{item.name}</p>
                {item.descricao && (
                  <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">
                    {item.descricao}
                  </p>
                )}
                {item.line_items && item.line_items.length > 0 && (
                  <table className="w-full text-xs border-collapse mt-1">
                    <thead>
                      <tr className="text-left">
                        <th className="py-1 pr-3">Descrição</th>
                        <th className="py-1 pr-3 w-16">Quant.</th>
                        <th className="py-1 w-20">Preço Unit.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.line_items.map((li, j) => (
                        <tr key={j} className="imx-border-b">
                          <td className="py-1 pr-3">{li.descricao}</td>
                          <td className="py-1 pr-3">{li.quant}</td>
                          <td className="py-1">{li.preco_unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {item.error && (
                  <p className="text-status-error text-xs mt-0.5">{item.error}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
