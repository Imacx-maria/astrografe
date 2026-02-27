# Quotes Extraction Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local dashboard that ingests document files (PDF/TXT/EML/MSG), normalises text, extracts `descrição` via LLM (OpenRouter), stores everything in Convex, and exposes vector search.

**Architecture:** Next.js (local) handles the full pipeline via API routes — file reading, normalisation, OpenRouter calls, and Convex writes. Convex stores raw text, parsed quotes, and embeddings. The UI has three tabs: Settings, Ingest, Search.

**Tech Stack:** Next.js 16 (App Router), Convex 1.32, TypeScript, Tailwind 4, Vitest (tests), OpenRouter (LLM + embeddings)

---

## Setup: Install test runner

Before Task 1, install Vitest + testing utilities:

```bash
npm install -D vitest @vitest/ui
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Add `vitest.config.ts` at project root:
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

---

## Task 1: Convex schema — 3 tables

**Files:**
- Modify: `convex/schema.ts`

**Step 1: Replace schema with full data model**

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  quotes_raw: defineTable({
    source_path: v.string(),
    source_type: v.string(), // "pdf" | "txt" | "eml" | "msg" etc.
    raw_text: v.string(),
    ingestedAt: v.number(), // Date.now()
  }),

  quotes_parsed: defineTable({
    raw_id: v.id("quotes_raw"),
    descricao: v.string(),
    confidence: v.number(), // 0–1
    model_used: v.string(),
    parse_warnings: v.array(v.string()),
  }),

  quote_embeddings: defineTable({
    parsed_id: v.id("quotes_parsed"),
    embedding: v.array(v.float64()),
    embedding_model: v.string(),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
  }),
});
```

**Step 2: Run Convex dev to validate schema (interactive)**

```bash
# In a separate terminal — this is the ONLY interactive step
npx convex dev --once
```

Expected: `✓ Schema pushed` (no errors). This also generates `convex/_generated/`.

**Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): add quotes_raw, quotes_parsed, quote_embeddings tables"
```

---

## Task 2: Text normaliser module + tests

**Files:**
- Create: `src/lib/normalizer.ts`
- Create: `src/lib/normalizer.test.ts`

**Step 1: Write failing tests first**

```ts
// src/lib/normalizer.test.ts
import { describe, it, expect } from "vitest";
import { normalizeText } from "./normalizer";

describe("normalizeText", () => {
  it("converts CRLF to LF", () => {
    expect(normalizeText("linha1\r\nlinha2")).toBe("linha1\nlinha2");
  });

  it("joins mid-sentence line breaks (next line starts lowercase)", () => {
    const input = "Este produto é fabricado em\nplástico rígido de alta densidade.";
    const expected = "Este produto é fabricado em plástico rígido de alta densidade.";
    expect(normalizeText(input)).toBe(expected);
  });

  it("does NOT join lines when first ends with punctuation", () => {
    const input = "Entrega prevista: 10 dias.\nContacto: geral@empresa.pt";
    expect(normalizeText(input)).toBe(input);
  });

  it("does NOT join lines when next starts uppercase (new sentence)", () => {
    const input = "Impressão: 4/0.\nEspecificações técnicas adicionais.";
    expect(normalizeText(input)).toBe(input);
  });

  it("fixes soft hyphenation (word-\nnext)", () => {
    const input = "plas-\ntificação couché";
    expect(normalizeText(input)).toBe("plastificação couché");
  });

  it("fixes hyphenation mid-compound (microcanelado\nnext)", () => {
    const input = "microcanelado 1mm contracolado frente e verso por\ncouché 135grs";
    expect(normalizeText(input)).toBe("microcanelado 1mm contracolado frente e verso por couché 135grs");
  });

  it("preserves paragraph breaks (blank line between sections)", () => {
    const input = "Secção A: materiais\n\nSecção B: acabamentos";
    expect(normalizeText(input)).toBe("Secção A: materiais\n\nSecção B: acabamentos");
  });

  it("collapses multiple blank lines into one", () => {
    const input = "linha1\n\n\n\nlinha2";
    expect(normalizeText(input)).toBe("linha1\n\nlinha2");
  });

  it("trims leading/trailing whitespace from each line", () => {
    const input = "  Caixa individual  \n  com janela  ";
    expect(normalizeText(input)).toBe("Caixa individual com janela");
  });

  it("handles real portuguese quote fragment", () => {
    const input =
      "Caneta esferográfica em plástico ABS com\r\nmecanismo de clique, tinta azul,\r\ngravação laser 1 face.\r\n\r\nPreço unitário: 0,85€";
    const result = normalizeText(input);
    expect(result).toContain("Caneta esferográfica em plástico ABS com mecanismo de clique, tinta azul, gravação laser 1 face.");
    expect(result).toContain("Preço unitário: 0,85€");
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
npm test
```
Expected: all tests FAIL with "normalizeText is not a function"

**Step 3: Implement normalizer**

```ts
// src/lib/normalizer.ts

const SENTENCE_ENDERS = /[.;:?!]$/;
const UPPERCASE_START = /^[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ]/;
const SOFT_HYPHEN = /-\n/g;

export function normalizeText(raw: string): string {
  // 1. Normalise line endings
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Trim each line
  const lines = text.split("\n").map((l) => l.trim());

  // 3. Collapse multiple blank lines into one
  const collapsed: string[] = [];
  let blankCount = 0;
  for (const line of lines) {
    if (line === "") {
      blankCount++;
      if (blankCount === 1) collapsed.push("");
    } else {
      blankCount = 0;
      collapsed.push(line);
    }
  }

  // 4. Fix soft hyphenation before join pass
  text = collapsed.join("\n").replace(SOFT_HYPHEN, "");

  // 5. Re-split and join mid-sentence breaks
  const parts = text.split("\n");
  const result: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const current = parts[i];
    const next = parts[i + 1];

    if (
      current !== "" &&
      next !== undefined &&
      next !== "" &&
      !SENTENCE_ENDERS.test(current) &&
      !UPPERCASE_START.test(next)
    ) {
      // Mid-sentence break: join with space
      result.push(current + " " + next);
      i += 2;
    } else {
      result.push(current);
      i++;
    }
  }

  return result.join("\n").trim();
}
```

**Step 4: Run tests — expect all pass**

```bash
npm test
```
Expected: 10/10 PASS

**Step 5: Commit**

```bash
git add src/lib/normalizer.ts src/lib/normalizer.test.ts vitest.config.ts package.json
git commit -m "feat(normalizer): deterministic line-break soup fixer + 10 tests"
```

---

## Task 3: OpenRouter client + circuit breaker

**Files:**
- Create: `src/lib/openrouter.ts`
- Create: `src/lib/circuit-breaker.ts`
- Create: `src/lib/circuit-breaker.test.ts`

**Step 1: Write circuit breaker tests**

```ts
// src/lib/circuit-breaker.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CircuitBreaker, ModelPool } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  beforeEach(() => vi.useFakeTimers());

  it("starts healthy", () => {
    const cb = new CircuitBreaker("test-model");
    expect(cb.isHealthy()).toBe(true);
  });

  it("marks unhealthy after first failure and sets cooldown", () => {
    const cb = new CircuitBreaker("test-model");
    cb.recordFailure();
    expect(cb.isHealthy()).toBe(false);
  });

  it("recovers after cooldown expires", () => {
    const cb = new CircuitBreaker("test-model");
    cb.recordFailure(); // cooldown = 30s (2^0 * 30)
    vi.advanceTimersByTime(31_000);
    expect(cb.isHealthy()).toBe(true);
  });

  it("doubles cooldown on repeated failures (exponential backoff)", () => {
    const cb = new CircuitBreaker("test-model");
    cb.recordFailure(); // fail 1: 30s cooldown
    vi.advanceTimersByTime(31_000);
    cb.recordFailure(); // fail 2: 60s cooldown
    vi.advanceTimersByTime(31_000);
    expect(cb.isHealthy()).toBe(false); // still in cooldown
    vi.advanceTimersByTime(30_000);
    expect(cb.isHealthy()).toBe(true);
  });

  it("resets fail count on success", () => {
    const cb = new CircuitBreaker("test-model");
    cb.recordFailure();
    vi.advanceTimersByTime(31_000);
    cb.recordSuccess();
    cb.recordFailure(); // should reset to 30s again
    vi.advanceTimersByTime(31_000);
    expect(cb.isHealthy()).toBe(true);
  });

  it("caps cooldown at 10 minutes", () => {
    const cb = new CircuitBreaker("test-model");
    for (let i = 0; i < 10; i++) {
      cb.recordFailure();
      vi.advanceTimersByTime(600_001);
    }
    // After many failures, cooldown should still recover after ≤ 10 min
    vi.advanceTimersByTime(600_001);
    expect(cb.isHealthy()).toBe(true);
  });
});

describe("ModelPool", () => {
  it("returns models in round-robin order", () => {
    const pool = new ModelPool(["a", "b", "c"]);
    expect(pool.nextHealthy()).toBe("a");
    expect(pool.nextHealthy()).toBe("b");
    expect(pool.nextHealthy()).toBe("c");
    expect(pool.nextHealthy()).toBe("a");
  });

  it("skips unhealthy models", () => {
    const pool = new ModelPool(["a", "b", "c"]);
    pool.recordFailure("a");
    expect(pool.nextHealthy()).toBe("b");
    expect(pool.nextHealthy()).toBe("c");
    expect(pool.nextHealthy()).toBe("b"); // a still unhealthy
  });

  it("returns null if all models are unhealthy", () => {
    const pool = new ModelPool(["a", "b"]);
    pool.recordFailure("a");
    pool.recordFailure("b");
    expect(pool.nextHealthy()).toBeNull();
  });
});
```

**Step 2: Run to confirm failure**

```bash
npm test src/lib/circuit-breaker.test.ts
```

**Step 3: Implement circuit breaker**

```ts
// src/lib/circuit-breaker.ts
const MAX_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const BASE_COOLDOWN_MS = 30 * 1000; // 30 seconds

export class CircuitBreaker {
  private failCount = 0;
  private cooldownUntil = 0;

  constructor(public readonly modelId: string) {}

  isHealthy(): boolean {
    return Date.now() >= this.cooldownUntil;
  }

  recordSuccess() {
    this.failCount = 0;
    this.cooldownUntil = 0;
  }

  recordFailure() {
    this.failCount += 1;
    const cooldown = Math.min(
      Math.pow(2, this.failCount - 1) * BASE_COOLDOWN_MS,
      MAX_COOLDOWN_MS
    );
    this.cooldownUntil = Date.now() + cooldown;
  }
}

export class ModelPool {
  private breakers: Map<string, CircuitBreaker>;
  private cursor = 0;
  private models: string[];

  constructor(modelIds: string[]) {
    this.models = modelIds;
    this.breakers = new Map(modelIds.map((id) => [id, new CircuitBreaker(id)]));
  }

  nextHealthy(): string | null {
    for (let i = 0; i < this.models.length; i++) {
      const idx = (this.cursor + i) % this.models.length;
      const model = this.models[idx];
      if (this.breakers.get(model)!.isHealthy()) {
        this.cursor = (idx + 1) % this.models.length;
        return model;
      }
    }
    return null;
  }

  recordSuccess(modelId: string) {
    this.breakers.get(modelId)?.recordSuccess();
  }

  recordFailure(modelId: string) {
    this.breakers.get(modelId)?.recordFailure();
  }
}
```

**Step 4: Run tests**

```bash
npm test src/lib/circuit-breaker.test.ts
```
Expected: all PASS

**Step 5: Implement OpenRouter client**

```ts
// src/lib/openrouter.ts

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
}

export async function chatCompletion(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  opts: { response_format?: { type: "json_object" }; temperature?: number } = {}
): Promise<ChatResponse> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Imacx-maria/astrografe",
      "X-Title": "Astrografe Quote Parser",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.1,
      response_format: opts.response_format,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new OpenRouterError(res.status, body);
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    model: data.model,
    usage: data.usage,
  };
}

export async function createEmbedding(
  apiKey: string,
  model: string,
  text: string
): Promise<EmbeddingResponse> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Imacx-maria/astrografe",
      "X-Title": "Astrografe Quote Parser",
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new OpenRouterError(res.status, body);
  }

  const data = await res.json();
  return {
    embedding: data.data[0].embedding,
    model: data.model,
  };
}

export class OpenRouterError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`OpenRouter error ${status}: ${body}`);
    this.name = "OpenRouterError";
  }

  isRateLimitOrTransient(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}
```

**Step 6: Commit**

```bash
git add src/lib/circuit-breaker.ts src/lib/circuit-breaker.test.ts src/lib/openrouter.ts
git commit -m "feat(pipeline): OpenRouter client + circuit breaker with round-robin pool"
```

---

## Task 4: LLM extractor — structured output + retry logic

**Files:**
- Create: `src/lib/extractor.ts`
- Create: `src/lib/extractor.test.ts`
- Create: `src/lib/prompts/extract-descricao.ts`

**Step 1: Create prompt template**

```ts
// src/lib/prompts/extract-descricao.ts

export const SYSTEM_PROMPT = `You are a technical quote parser for Portuguese commercial documents.

Your task: extract ONLY the "descrição" — the technical description of the article.

Rules:
- Include: materials, dimensions (cm/mm/grs), printing specs (4/0, 4/4), finishing, packaging, technical observations
- Exclude: greetings, signatures, payment terms, delivery dates, totals, VAT, repeated headers, "Valores mantêm-se" unless spec changes
- Preserve all units exactly: cm, mm, grs., 4/0, g/m²
- Return ONLY valid JSON, nothing else.

Response schema (strict):
{
  "descricao": "string — clean technical description",
  "confidence": 0.0,
  "warnings": ["string"]
}`;

export const buildUserPrompt = (normalizedText: string) => `
Document text:
"""
${normalizedText}
"""

Extract the descrição (technical article description: materials, dimensions, finishing, packaging, technical observations).
Return JSON only.`.trim();
```

**Step 2: Write extractor tests**

```ts
// src/lib/extractor.test.ts
import { describe, it, expect, vi } from "vitest";
import { parseExtractionResponse, isRetryableModel } from "./extractor";

describe("parseExtractionResponse", () => {
  it("parses valid JSON response", () => {
    const raw = `{"descricao": "Caneta ABS, tinta azul", "confidence": 0.92, "warnings": []}`;
    const result = parseExtractionResponse(raw);
    expect(result.descricao).toBe("Caneta ABS, tinta azul");
    expect(result.confidence).toBe(0.92);
    expect(result.warnings).toEqual([]);
  });

  it("parses JSON wrapped in markdown code block", () => {
    const raw = "```json\n{\"descricao\": \"Pasta A4\", \"confidence\": 0.8, \"warnings\": []}\n```";
    const result = parseExtractionResponse(raw);
    expect(result.descricao).toBe("Pasta A4");
  });

  it("throws on missing descricao field", () => {
    const raw = `{"confidence": 0.9, "warnings": []}`;
    expect(() => parseExtractionResponse(raw)).toThrow("missing descricao");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseExtractionResponse("not json at all")).toThrow();
  });

  it("clamps confidence to 0–1 range", () => {
    const raw = `{"descricao": "test", "confidence": 1.5, "warnings": []}`;
    const result = parseExtractionResponse(raw);
    expect(result.confidence).toBe(1);
  });
});

describe("isRetryableModel", () => {
  it("returns true for rate limit / server errors", () => {
    expect(isRetryableModel(429)).toBe(true);
    expect(isRetryableModel(500)).toBe(true);
    expect(isRetryableModel(503)).toBe(true);
  });

  it("returns false for auth / bad request errors", () => {
    expect(isRetryableModel(401)).toBe(false);
    expect(isRetryableModel(400)).toBe(false);
  });
});
```

**Step 3: Run to confirm failure**

```bash
npm test src/lib/extractor.test.ts
```

**Step 4: Implement extractor**

```ts
// src/lib/extractor.ts
import { ModelPool, type CircuitBreaker } from "./circuit-breaker";
import { chatCompletion, OpenRouterError } from "./openrouter";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts/extract-descricao";

export interface ExtractionResult {
  descricao: string;
  confidence: number;
  warnings: string[];
  model_used: string;
}

export interface ParsedJSON {
  descricao: string;
  confidence: number;
  warnings: string[];
}

export function parseExtractionResponse(raw: string): ParsedJSON {
  // Strip markdown code blocks if present
  const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Invalid JSON from LLM: ${cleaned.slice(0, 100)}`);
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.descricao !== "string" || obj.descricao.trim() === "") {
    throw new Error("missing descricao in LLM response");
  }

  const confidence = typeof obj.confidence === "number"
    ? Math.min(1, Math.max(0, obj.confidence))
    : 0.5;

  const warnings = Array.isArray(obj.warnings)
    ? (obj.warnings as string[]).filter((w) => typeof w === "string")
    : [];

  return { descricao: obj.descricao.trim(), confidence, warnings };
}

export function isRetryableModel(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function extractDescricao(
  normalizedText: string,
  apiKey: string,
  pool: ModelPool
): Promise<ExtractionResult> {
  const MAX_ATTEMPTS = pool["models"].length + 1; // try each model + 1 strong retry

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const modelId = pool.nextHealthy();
    if (!modelId) throw new Error("All models are in cooldown. Try again later.");

    try {
      const response = await chatCompletion(apiKey, modelId, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(normalizedText) },
      ], { response_format: { type: "json_object" } });

      const parsed = parseExtractionResponse(response.content);
      pool.recordSuccess(modelId);

      return { ...parsed, model_used: modelId };
    } catch (err) {
      lastError = err as Error;

      if (err instanceof OpenRouterError && isRetryableModel(err.status)) {
        pool.recordFailure(modelId);
        continue; // try next model
      }

      // Non-retryable (bad JSON, auth error): still try next model once
      if (attempt === 0) continue;
      throw err;
    }
  }

  throw lastError ?? new Error("Extraction failed after all attempts");
}
```

**Step 5: Run tests**

```bash
npm test src/lib/extractor.test.ts
```
Expected: all PASS

**Step 6: Commit**

```bash
git add src/lib/extractor.ts src/lib/extractor.test.ts src/lib/prompts/extract-descricao.ts
git commit -m "feat(extractor): LLM extraction with JSON validation + model retry logic"
```

---

## Task 5: Convex mutations + vector search query

**Files:**
- Create: `convex/quotes.ts`
- Create: `convex/search.ts`

**Step 1: Create mutations file**

```ts
// convex/quotes.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Store raw ingested text
export const insertRaw = mutation({
  args: {
    source_path: v.string(),
    source_type: v.string(),
    raw_text: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("quotes_raw", {
      ...args,
      ingestedAt: Date.now(),
    });
  },
});

// Store parsed quote
export const insertParsed = mutation({
  args: {
    raw_id: v.id("quotes_raw"),
    descricao: v.string(),
    confidence: v.number(),
    model_used: v.string(),
    parse_warnings: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("quotes_parsed", args);
  },
});

// Store embedding
export const insertEmbedding = mutation({
  args: {
    parsed_id: v.id("quotes_parsed"),
    embedding: v.array(v.float64()),
    embedding_model: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("quote_embeddings", args);
  },
});

// List all parsed quotes (for ingest UI)
export const listParsed = query({
  handler: async (ctx) => {
    return await ctx.db.query("quotes_parsed").order("desc").take(100);
  },
});
```

**Step 2: Create vector search query**

```ts
// convex/search.ts
import { action } from "./_generated/server";
import { v } from "convex/values";

export const vectorSearch = action({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.vectorSearch("quote_embeddings", "by_embedding", {
      vector: args.embedding,
      limit: args.limit ?? 10,
    });

    // Fetch full parsed quote for each result
    const enriched = await Promise.all(
      results.map(async (r) => {
        const emb = await ctx.runQuery(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (internal as any).quotes.getEmbeddingById,
          { id: r._id }
        );
        return { ...r, ...emb };
      })
    );

    return enriched;
  },
});
```

**Note:** The vector search action needs a helper query. Add to `convex/quotes.ts`:

```ts
import { internal } from "./_generated/api";

export const getEmbeddingById = query({
  args: { id: v.id("quote_embeddings") },
  handler: async (ctx, args) => {
    const emb = await ctx.db.get(args.id);
    if (!emb) return null;
    const parsed = await ctx.db.get(emb.parsed_id);
    return { embedding: emb, parsed };
  },
});
```

**Step 3: Push to Convex**

```bash
npx convex dev --once
```
Expected: functions pushed, no errors

**Step 4: Commit**

```bash
git add convex/quotes.ts convex/search.ts
git commit -m "feat(convex): insert mutations + vector search action"
```

---

## Task 6: Next.js API routes — ingest pipeline

**Files:**
- Create: `src/app/api/ingest/route.ts`
- Create: `src/app/api/search/route.ts`
- Create: `src/lib/config.ts`

**Step 1: Config loader (reads from .env.local)**

```ts
// src/lib/config.ts

export interface AppConfig {
  openrouterApiKey: string;
  models: {
    fast: string;   // cheap/fast parser
    strong: string; // reliable fallback
    backup: string; // different vendor
    embedding: string;
  };
}

export function getConfig(): AppConfig {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in .env.local");

  return {
    openrouterApiKey: apiKey,
    models: {
      fast: process.env.MODEL_FAST ?? "google/gemini-flash-1.5",
      strong: process.env.MODEL_STRONG ?? "anthropic/claude-3-5-sonnet",
      backup: process.env.MODEL_BACKUP ?? "openai/gpt-4o-mini",
      embedding: process.env.MODEL_EMBEDDING ?? "openai/text-embedding-3-small",
    },
  };
}
```

**Step 2: Ingest API route**

```ts
// src/app/api/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { normalizeText } from "@/lib/normalizer";
import { extractDescricao } from "@/lib/extractor";
import { createEmbedding } from "@/lib/openrouter";
import { ModelPool } from "@/lib/circuit-breaker";
import { getConfig } from "@/lib/config";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Module-level pool (persists across requests in dev server)
let pool: ModelPool | null = null;

function getPool(config: ReturnType<typeof getConfig>) {
  if (!pool) {
    pool = new ModelPool([config.models.fast, config.models.strong, config.models.backup]);
  }
  return pool;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      source_path: string;
      source_type: string;
      raw_text: string;
    };

    const config = getConfig();
    const modelPool = getPool(config);

    // 1. Store raw
    const rawId = await convex.mutation(api.quotes.insertRaw, {
      source_path: body.source_path,
      source_type: body.source_type,
      raw_text: body.raw_text,
    });

    // 2. Normalize
    const normalized = normalizeText(body.raw_text);

    // 3. Extract
    const extraction = await extractDescricao(normalized, config.openrouterApiKey, modelPool);

    // 4. Store parsed
    const parsedId = await convex.mutation(api.quotes.insertParsed, {
      raw_id: rawId,
      descricao: extraction.descricao,
      confidence: extraction.confidence,
      model_used: extraction.model_used,
      parse_warnings: extraction.warnings,
    });

    // 5. Embed
    const embResult = await createEmbedding(
      config.openrouterApiKey,
      config.models.embedding,
      extraction.descricao
    );

    // 6. Store embedding
    await convex.mutation(api.quotes.insertEmbedding, {
      parsed_id: parsedId,
      embedding: embResult.embedding,
      embedding_model: embResult.model,
    });

    return NextResponse.json({ success: true, parsedId, descricao: extraction.descricao });
  } catch (err) {
    console.error("[ingest]", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
```

**Step 3: Search API route**

```ts
// src/app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { createEmbedding } from "@/lib/openrouter";
import { getConfig } from "@/lib/config";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json() as { query: string };
    const config = getConfig();

    // Embed the search query
    const embResult = await createEmbedding(
      config.openrouterApiKey,
      config.models.embedding,
      query
    );

    // Vector search
    const results = await convex.action(api.search.vectorSearch, {
      embedding: embResult.embedding,
      limit: 10,
    });

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

**Step 4: Add env vars to .env.local**

Add these lines (user fills in values):
```
OPENROUTER_API_KEY=sk-or-...
MODEL_FAST=google/gemini-flash-1.5
MODEL_STRONG=anthropic/claude-3-5-sonnet
MODEL_BACKUP=openai/gpt-4o-mini
MODEL_EMBEDDING=openai/text-embedding-3-small
```

Also create `.env.example` (committed to git):
```
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
OPENROUTER_API_KEY=sk-or-...
MODEL_FAST=google/gemini-flash-1.5
MODEL_STRONG=anthropic/claude-3-5-sonnet
MODEL_BACKUP=openai/gpt-4o-mini
MODEL_EMBEDDING=openai/text-embedding-3-small
```

**Step 5: Commit**

```bash
git add src/app/api/ src/lib/config.ts .env.example
git commit -m "feat(api): ingest + search API routes wired to Convex + OpenRouter"
```

---

## Task 7: Settings UI

**Files:**
- Create: `src/app/settings/page.tsx`
- Modify: `src/app/page.tsx` (add nav)
- Modify: `src/app/layout.tsx` (update metadata)

**Step 1: Update layout metadata**

```tsx
export const metadata: Metadata = {
  title: "Astrografe — Quote Parser",
  description: "Local quote extraction and search dashboard",
};
```

**Step 2: Add global nav to layout**

```tsx
// In layout.tsx body, before ConvexClientProvider:
<nav className="border-b border-neutral-200 px-6 py-3 flex gap-6 text-sm font-medium">
  <a href="/ingest" className="hover:text-blue-600">Ingest</a>
  <a href="/search" className="hover:text-blue-600">Search</a>
  <a href="/settings" className="hover:text-blue-600">Settings</a>
</nav>
```

**Step 3: Settings page**

```tsx
// src/app/settings/page.tsx
"use client";

export default function SettingsPage() {
  return (
    <main className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">OpenRouter API Key</h2>
        <p className="text-sm text-neutral-500">
          Set <code className="bg-neutral-100 px-1 rounded">OPENROUTER_API_KEY</code> in your{" "}
          <code className="bg-neutral-100 px-1 rounded">.env.local</code> file and restart the dev server.
          Keys are never stored in the browser or committed to git.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Model Configuration</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 font-medium">Env var</th>
              <th className="py-2 font-medium">Default</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {[
              ["Fast/cheap parser", "MODEL_FAST", "google/gemini-flash-1.5"],
              ["Strong/reliable parser", "MODEL_STRONG", "anthropic/claude-3-5-sonnet"],
              ["Backup (different vendor)", "MODEL_BACKUP", "openai/gpt-4o-mini"],
              ["Embeddings", "MODEL_EMBEDDING", "openai/text-embedding-3-small"],
            ].map(([role, env, def]) => (
              <tr key={env}>
                <td className="py-2 pr-4 text-neutral-600">{role}</td>
                <td className="py-2 pr-4 font-mono text-xs">{env}</td>
                <td className="py-2 text-neutral-500 text-xs">{def}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-neutral-400">Override any model by setting the env var in .env.local</p>
      </section>
    </main>
  );
}
```

**Step 4: Commit**

```bash
git add src/app/settings/ src/app/layout.tsx
git commit -m "feat(ui): settings page with env var reference"
```

---

## Task 8: Ingest UI

**Files:**
- Create: `src/app/ingest/page.tsx`

**Goal:** File queue with status badges. User picks files, they get POSTed to `/api/ingest` one by one.

```tsx
// src/app/ingest/page.tsx
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
    setQueue((q) => q.map((item) => (item.id === id ? { ...item, ...patch } : item)));

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
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
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
            <li key={item.id} className="flex items-start gap-3 text-sm border rounded-lg p-3">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status]}`}>
                {item.status}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.name}</p>
                {item.descricao && (
                  <p className="text-neutral-500 text-xs mt-0.5 line-clamp-2">{item.descricao}</p>
                )}
                {item.error && <p className="text-red-600 text-xs mt-0.5">{item.error}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/ingest/
git commit -m "feat(ui): ingest page with drag-drop file queue + status badges"
```

---

## Task 9: Search UI

**Files:**
- Create: `src/app/search/page.tsx`

```tsx
// src/app/search/page.tsx
"use client";

import { useState } from "react";

interface SearchResult {
  _score: number;
  parsed?: {
    descricao: string;
    confidence: number;
    model_used: string;
  };
  embedding?: {
    embedding_model: string;
  };
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

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-bold">Search Quotes</h1>

      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Caneta plástico azul gravação laser…"
          className="flex-1 border border-neutral-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {results.length > 0 && (
        <ul className="space-y-3">
          {results.map((r, i) => (
            <li key={i} className="border rounded-lg p-4 space-y-1">
              <p className="text-sm">{r.parsed?.descricao}</p>
              <div className="flex gap-4 text-xs text-neutral-400">
                <span>Score: {r._score?.toFixed(3)}</span>
                <span>Confidence: {((r.parsed?.confidence ?? 0) * 100).toFixed(0)}%</span>
                <span>Model: {r.parsed?.model_used}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {results.length === 0 && !loading && query && (
        <p className="text-neutral-400 text-sm">No results found.</p>
      )}
    </main>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/search/
git commit -m "feat(ui): search page with vector results"
```

---

## Task 10: Update home page + redirect

**Files:**
- Modify: `src/app/page.tsx`

Replace boilerplate with a simple redirect to `/ingest`:

```tsx
// src/app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/ingest");
}
```

```bash
git add src/app/page.tsx
git commit -m "chore: redirect home to /ingest"
```

---

## Verification

### End-to-end test checklist

1. **Convex schema**: `npx convex dev --once` — no errors, `_generated/` created
2. **Tests**: `npm test` — all pass (normalizer + circuit-breaker + extractor)
3. **Dev server**: `npm run dev` — no TypeScript errors, app loads at http://localhost:3000
4. **Settings page**: http://localhost:3000/settings — renders model config table
5. **Ingest**: Drop a TXT file with Portuguese product text → see status change queued → processing → done + descrição preview
6. **Search**: Type a product description → get ranked results

### Environment required before running ingest
```
OPENROUTER_API_KEY=sk-or-...  # required
```

### Run everything
```bash
# Terminal 1 — Convex dev
npx convex dev

# Terminal 2 — Next.js
npm run dev

# Tests
npm test
```
