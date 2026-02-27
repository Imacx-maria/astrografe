"use client";

import { useRef, useState } from "react";

type FileStatus = "queued" | "processing" | "done" | "error";

interface QueueItem {
  id: string;
  name: string;
  status: FileStatus;
  descricao?: string;
  error?: string;
}

const STATUS_COLORS: Record<FileStatus, string> = {
  queued: "bg-neutral-100 text-neutral-600",
  processing: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

export default function IngestPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateItem = (id: string, patch: Partial<QueueItem>) =>
    setQueue((q) =>
      q.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const newItems: QueueItem[] = Array.from(files).map((f) => ({
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
        const raw_text = await file.text();
        const source_type = file.name.split(".").pop()?.toLowerCase() ?? "txt";

        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_path: file.name, source_type, raw_text }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unknown error");

        updateItem(item.id, { status: "done", descricao: data.descricao });
      } catch (err) {
        updateItem(item.id, { status: "error", error: (err as Error).message });
      }
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-bold">Ingest Documents</h1>

      <div
        className="border-2 border-dashed border-neutral-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-400 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <p className="text-neutral-500">Drop files here or click to select</p>
        <p className="text-xs text-neutral-400 mt-1">Supports TXT, EML, PDF text</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".txt,.eml,.pdf,.msg"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {queue.length > 0 && (
        <ul className="space-y-2">
          {queue.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 text-sm border rounded-lg p-3"
            >
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STATUS_COLORS[item.status]}`}
              >
                {item.status}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.name}</p>
                {item.descricao && (
                  <p className="text-neutral-500 text-xs mt-0.5 line-clamp-2">
                    {item.descricao}
                  </p>
                )}
                {item.error && (
                  <p className="text-red-600 text-xs mt-0.5">{item.error}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
