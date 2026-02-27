import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { createEmbedding } from "@/lib/openrouter";
import { getConfig } from "@/lib/config";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query: string };
    const config = getConfig();

    // Embed the search query
    const embResult = await createEmbedding(
      config.openrouterApiKey,
      config.models.embedding,
      query
    );

    // Vector search in Convex
    const results = await convex.action(api.search.vectorSearch, {
      embedding: embResult.embedding,
      limit: 10,
    });

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
