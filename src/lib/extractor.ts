import { ModelPool } from "./circuit-breaker";
import { chatCompletion, OpenRouterError } from "./openrouter";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts/extract-descricao";

export interface LineItem {
  descricao: string;
  medida?: string | null;
  quant: string;
  preco_unit: string;
}

export interface ExtractionResult {
  descricao: string;
  confidence: number;
  warnings: string[];
  model_used: string;
  line_items: LineItem[];
}

export interface ParsedJSON {
  descricao: string;
  confidence: number;
  warnings: string[];
  line_items: LineItem[];
}

export function parseExtractionResponse(raw: string): ParsedJSON {
  // Strip markdown code blocks if present (trim first to handle leading whitespace/newlines)
  const cleaned = raw.trim().replace(/^\s*```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/, "").trim();

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

  const line_items: LineItem[] = Array.isArray(obj.line_items)
    ? (obj.line_items as LineItem[])
        .filter(
          (item) =>
            typeof item === "object" &&
            typeof item.descricao === "string" &&
            typeof item.quant === "string" &&
            typeof item.preco_unit === "string"
        )
        .map((item) => ({
          descricao: item.descricao,
          medida: typeof item.medida === "string" && item.medida ? item.medida : undefined,
          quant: item.quant,
          preco_unit: item.preco_unit,
        }))
    : [];

  return { descricao: obj.descricao.trim(), confidence, warnings, line_items };
}

export function isRetryableModel(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function extractDescricao(
  normalizedText: string,
  apiKey: string,
  pool: ModelPool
): Promise<ExtractionResult> {
  const MAX_ATTEMPTS = pool.size + 1;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const modelId = pool.nextHealthy();
    if (!modelId) throw new Error("All models are in cooldown. Try again later.");

    try {
      const response = await chatCompletion(apiKey, modelId, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(normalizedText) },
      ]);

      const parsed = parseExtractionResponse(response.content);
      pool.recordSuccess(modelId);

      return { ...parsed, model_used: modelId };
    } catch (err) {
      lastError = err as Error;

      if (err instanceof OpenRouterError && isRetryableModel(err.status)) {
        pool.recordFailure(modelId);
        continue; // try next model
      }

      // OpenRouter error that's non-retryable (auth/bad-request): record failure so
      // the circuit breaker tracks the broken model, then try next model once.
      if (err instanceof OpenRouterError) {
        pool.recordFailure(modelId);
        if (attempt === 0) continue;
        throw err;
      }

      // Parse error (bad JSON from LLM): try next model once without penalising the circuit breaker
      if (attempt === 0) continue;
      throw err;
    }
  }

  throw lastError ?? new Error("Extraction failed after all attempts");
}
