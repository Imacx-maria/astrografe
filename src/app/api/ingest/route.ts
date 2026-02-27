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

    // Parse quote date from filename prefix YYYYMMDD_HHMMSS
    const dateMatch = body.source_path.match(/^(\d{4})(\d{2})(\d{2})_/);
    const quote_date = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : undefined;

    // Extract ORC number from filename e.g. "ORC_00068346-6"
    const orcMatch = body.source_path.match(/ORC_(\d{5,9}-\d+)/);
    const orc_number = orcMatch ? `ORC_${orcMatch[1]}` : undefined;

    // Duplicate check
    if (orc_number) {
      const existing = await convex.query(api.quotes.findByOrcNumber, { orc_number });
      if (existing) {
        return NextResponse.json(
          { duplicate: true, orc_number, existingId: existing._id },
          { status: 409 }
        );
      }
    }

    // 1. Store raw
    const rawId = await convex.mutation(api.quotes.insertRaw, {
      source_path: body.source_path,
      source_type: body.source_type,
      raw_text: body.raw_text,
      quote_date,
      orc_number,
    });

    // 2. Normalize + truncate to ~50k chars to stay within model context limits
    const normalized = normalizeText(body.raw_text).slice(0, 50_000);

    // 3. Extract descrição via LLM
    const extraction = await extractDescricao(normalized, config.openrouterApiKey, modelPool);

    // 4. Store parsed quote
    const parsedId = await convex.mutation(api.quotes.insertParsed, {
      raw_id: rawId,
      descricao: extraction.descricao,
      confidence: extraction.confidence,
      model_used: extraction.model_used,
      parse_warnings: extraction.warnings,
      line_items: extraction.line_items,
    });

    // 5. Embed descrição (best-effort — failure does not block ingest)
    try {
      const embResult = await createEmbedding(
        config.openrouterApiKey,
        config.models.embedding,
        extraction.descricao
      );
      await convex.mutation(api.quotes.insertEmbedding, {
        parsed_id: parsedId,
        embedding: embResult.embedding,
        embedding_model: embResult.model,
      });
    } catch (embErr) {
      console.warn("[ingest] embedding skipped:", (embErr as Error).message);
    }

    return NextResponse.json({ success: true, parsedId, descricao: extraction.descricao, line_items: extraction.line_items });
  } catch (err) {
    console.error("[ingest]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
