import { ModelPool } from "./circuit-breaker";
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
  // Access private field via type assertion for max attempts calculation
  const modelCount = (pool as unknown as { models: string[] }).models.length;
  const MAX_ATTEMPTS = modelCount + 1;

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
