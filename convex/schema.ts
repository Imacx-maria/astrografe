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
