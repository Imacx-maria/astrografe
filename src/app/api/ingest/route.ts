import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { normalizeText } from "@/lib/normalizer";
import { extractDescricao } from "@/lib/extractor";
import { createEmbedding } from "@/lib/openrouter";
import { ModelPool } from "@/lib/circuit-breaker";
import { getConfig } from "@/lib/config";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Module-level pool persists across requests within the same dev server process
let pool: ModelPool | null = null;

function getPool(config: ReturnType<typeof getConfig>) {
  if (!pool) {
    pool = new ModelPool([config.models.fast, config.models.strong, config.models.backup]);
  }
  return pool;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      source_path: string;
      source_type: string;
      raw_text: string;
    };

    const config = getConfig();
    const modelPool = getPool(config);

    // 1. Store raw
    const rawId = await convex.mutation(api.quotes.insertRaw, {
      source_path: body.source_path,
      source_type: body.source_type,
      raw_text: body.raw_text,
    });

    // 2. Normalize
    const normalized = normalizeText(body.raw_text);

    // 3. Extract descrição via LLM
    const extraction = await extractDescricao(normalized, config.openrouterApiKey, modelPool);

    // 4. Store parsed quote
    const parsedId = await convex.mutation(api.quotes.insertParsed, {
      raw_id: rawId,
      descricao: extraction.descricao,
      confidence: extraction.confidence,
      model_used: extraction.model_used,
      parse_warnings: extraction.warnings,
    });

    // 5. Embed descrição
    const embResult = await createEmbedding(
      config.openrouterApiKey,
      config.models.embedding,
      extraction.descricao
    );

    // 6. Store embedding
    await convex.mutation(api.quotes.insertEmbedding, {
      parsed_id: parsedId,
      embedding: embResult.embedding,
      embedding_model: embResult.model,
    });

    return NextResponse.json({ success: true, parsedId, descricao: extraction.descricao });
  } catch (err) {
    console.error("[ingest]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
