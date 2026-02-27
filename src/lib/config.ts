export interface AppConfig {
  openrouterApiKey: string;
  models: {
    fast: string;
    strong: string;
    backup: string;
    embedding: string;
  };
}

export function getConfig(): AppConfig {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in .env.local");

  return {
    openrouterApiKey: apiKey,
    models: {
      fast: process.env.MODEL_FAST ?? "google/gemini-flash-1.5",
      strong: process.env.MODEL_STRONG ?? "anthropic/claude-3-5-sonnet",
      backup: process.env.MODEL_BACKUP ?? "openai/gpt-4o-mini",
      embedding: process.env.MODEL_EMBEDDING ?? "openai/text-embedding-3-small",
    },
  };
}
