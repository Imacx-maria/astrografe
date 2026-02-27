"use client";

export default function SettingsPage() {
  return (
    <main className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">OpenRouter API Key</h2>
        <p className="text-sm text-neutral-500">
          Set{" "}
          <code className="bg-neutral-100 px-1 rounded">OPENROUTER_API_KEY</code>{" "}
          in your{" "}
          <code className="bg-neutral-100 px-1 rounded">.env.local</code> file
          and restart the dev server. Keys are never stored in the browser or
          committed to git.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Model Configuration</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Env var</th>
              <th className="py-2 font-medium">Default</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {[
              ["Fast/cheap parser", "MODEL_FAST", "google/gemini-flash-1.5"],
              ["Strong/reliable parser", "MODEL_STRONG", "anthropic/claude-3-5-sonnet"],
              ["Backup (different vendor)", "MODEL_BACKUP", "openai/gpt-4o-mini"],
              ["Embeddings", "MODEL_EMBEDDING", "openai/text-embedding-3-small"],
            ].map(([role, env, def]) => (
              <tr key={env}>
                <td className="py-2 pr-4 text-neutral-600">{role}</td>
                <td className="py-2 pr-4 font-mono text-xs">{env}</td>
                <td className="py-2 text-neutral-500 text-xs">{def}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-neutral-400">
          Override any model by setting the env var in .env.local
        </p>
      </section>
    </main>
  );
}
