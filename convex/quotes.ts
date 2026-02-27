import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Check if an ORC number already exists
export const findByOrcNumber = query({
  args: { orc_number: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quotes_raw")
      .withIndex("by_orc_number", (q) => q.eq("orc_number", args.orc_number))
      .first();
  },
});

// Store raw ingested text
export const insertRaw = mutation({
  args: {
    source_path: v.string(),
    source_type: v.string(),
    raw_text: v.string(),
    quote_date: v.optional(v.string()),
    orc_number: v.optional(v.string()),
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
    line_items: v.optional(
      v.array(
        v.object({
          descricao: v.string(),
          quant: v.string(),
          preco_unit: v.string(),
        })
      )
    ),
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

// Full-text search on descricao — returns parsed + raw metadata joined
export const searchParsed = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const parsed = await ctx.db
      .query("quotes_parsed")
      .withSearchIndex("search_descricao", (q) => q.search("descricao", args.query))
      .take(args.limit ?? 20);

    return Promise.all(
      parsed.map(async (p) => {
        const raw = await ctx.db.get(p.raw_id);
        return {
          _id: p._id,
          descricao: p.descricao,
          line_items: p.line_items ?? [],
          quote_date: raw?.quote_date ?? null,
          orc_number: raw?.orc_number ?? null,
          source_path: raw?.source_path ?? null,
        };
      })
    );
  },
});

// List all parsed quotes (for ingest UI)
export const listParsed = query({
  handler: async (ctx) => {
    return await ctx.db.query("quotes_parsed").order("desc").take(100);
  },
});

// Helper: fetch embedding + its parsed quote (used internally by vector search)
export const getEmbeddingById = internalQuery({
  args: { id: v.id("quote_embeddings") },
  handler: async (ctx, args) => {
    const emb = await ctx.db.get(args.id);
    if (!emb) return null;
    const parsed = await ctx.db.get(emb.parsed_id);
    return { embedding: emb, parsed };
  },
});
