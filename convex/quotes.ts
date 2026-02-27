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

// Helper: fetch embedding + its parsed quote (used by vector search)
export const getEmbeddingById = query({
  args: { id: v.id("quote_embeddings") },
  handler: async (ctx, args) => {
    const emb = await ctx.db.get(args.id);
    if (!emb) return null;
    const parsed = await ctx.db.get(emb.parsed_id);
    return { embedding: emb, parsed };
  },
});
