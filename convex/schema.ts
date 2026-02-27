import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  quotes_raw: defineTable({
    source_path: v.string(),
    source_type: v.string(), // "pdf" | "txt" | "eml" | "msg" etc.
    raw_text: v.string(),
    ingestedAt: v.number(), // Date.now()
    quote_date: v.optional(v.string()), // ISO date parsed from filename e.g. "2024-01-15"
    orc_number: v.optional(v.string()), // e.g. "ORC_00068346-6"
  }).index("by_orc_number", ["orc_number"]),

  quotes_parsed: defineTable({
    raw_id: v.id("quotes_raw"),
    descricao: v.string(),
    descricao_normalized: v.optional(v.string()), // accent-stripped lowercase, for search
    confidence: v.number(), // 0–1
    model_used: v.string(),
    parse_warnings: v.array(v.string()),
    line_items: v.optional(
      v.array(
        v.object({
          descricao: v.string(),
          quant: v.string(),
          preco_unit: v.string(),
          medida: v.optional(v.string()), // extracted measurement e.g. "12.5 x 13 cm"
        })
      )
    ),
  })
    .searchIndex("search_descricao", { searchField: "descricao" })
    .searchIndex("search_descricao_norm", { searchField: "descricao_normalized" }),

  quote_embeddings: defineTable({
    parsed_id: v.id("quotes_parsed"),
    embedding: v.array(v.float64()),
    embedding_model: v.string(),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
  }),
});
