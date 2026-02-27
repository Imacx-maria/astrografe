import { describe, it, expect } from "vitest";
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

  it("clamps confidence to 0-1 range", () => {
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
