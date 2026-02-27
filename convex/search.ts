import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

type SearchResult = {
  _score: number;
  embedding: Doc<"quote_embeddings"> | null;
  parsed: Doc<"quotes_parsed"> | null;
};

export const vectorSearch = action({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SearchResult[]> => {
    const results = await ctx.vectorSearch("quote_embeddings", "by_embedding", {
      vector: args.embedding,
      limit: args.limit ?? 10,
    });

    return Promise.all(
      results.map(async (r): Promise<SearchResult> => {
        const data = await ctx.runQuery(internal.quotes.getEmbeddingById, {
          id: r._id,
        });
        return {
          _score: r._score,
          embedding: data?.embedding ?? null,
          parsed: data?.parsed ?? null,
        };
      })
    );
  },
});
