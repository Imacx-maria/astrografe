import { action } from "./_generated/server";
import { internal } from "./_generated/api";
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
        const data = await ctx.runQuery(internal.quotes.getEmbeddingById, {
          id: r._id,
        });
        return { _score: r._score, ...data };
      })
    );

    return enriched;
  },
});
