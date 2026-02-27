export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
}

export async function chatCompletion(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  opts: { response_format?: { type: "json_object" }; temperature?: number } = {}
): Promise<ChatResponse> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Imacx-maria/astrografe",
      "X-Title": "Astrografe Quote Parser",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.1,
      response_format: opts.response_format,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new OpenRouterError(res.status, body);
  }

  const data = await res.json();
  return {
    content: data.choices[0].message.content,
    model: data.model,
    usage: data.usage,
  };
}

export async function createEmbedding(
  apiKey: string,
  model: string,
  text: string
): Promise<EmbeddingResponse> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Imacx-maria/astrografe",
      "X-Title": "Astrografe Quote Parser",
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new OpenRouterError(res.status, body);
  }

  const data = await res.json();
  return {
    embedding: data.data[0].embedding,
    model: data.model,
  };
}

export class OpenRouterError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`OpenRouter error ${status}: ${body}`);
    this.name = "OpenRouterError";
  }

  isRateLimitOrTransient(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}
