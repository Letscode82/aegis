/**
 * Registry factory — reads env and returns the trademark registries that
 * are fully configured. None configured → empty (dev/CI falls back to the
 * local TrademarkMark table / bootstrap). Same "real client when creds are
 * present, safe fallback otherwise" pattern as the M365 factory.
 *
 * Production fail-loud: a PARTIALLY-configured registry (some but not all
 * required vars) throws — a half-wired credential is a silent-failure trap.
 *
 * Env:
 *   USPTO  — USPTO_API_KEY, USPTO_SEARCH_URL
 *   EUIPO  — EUIPO_CLIENT_ID, EUIPO_CLIENT_SECRET, EUIPO_TOKEN_URL, EUIPO_SEARCH_URL
 *   WIPO   — WIPO_API_KEY, WIPO_SEARCH_URL
 */
import { type TrademarkRegistryClient, type RegistryMark, type HttpFetch, DEFAULT_HTTP } from "./types";
import { UsptoClient } from "./uspto";
import { EuipoClient } from "./euipo";
import { WipoClient } from "./wipo";

type Env = Record<string, string | undefined>;

function pick(env: Env, keys: string[]): { present: string[]; missing: string[] } {
  const present = keys.filter((k) => (env[k] || "").trim());
  return { present, missing: keys.filter((k) => !(env[k] || "").trim()) };
}

/** Build the configured registry clients from env. Throws on partial config. */
export function getConfiguredRegistries(env: Env = process.env, http: HttpFetch = DEFAULT_HTTP): TrademarkRegistryClient[] {
  const clients: TrademarkRegistryClient[] = [];
  const isProd = (env.NODE_ENV || "") === "production";

  const groups: Array<{ source: string; keys: string[]; build: () => TrademarkRegistryClient }> = [
    {
      source: "USPTO",
      keys: ["USPTO_API_KEY", "USPTO_SEARCH_URL"],
      build: () => new UsptoClient({ apiKey: env.USPTO_API_KEY!, searchUrl: env.USPTO_SEARCH_URL! }, http),
    },
    {
      source: "EUIPO",
      keys: ["EUIPO_CLIENT_ID", "EUIPO_CLIENT_SECRET", "EUIPO_TOKEN_URL", "EUIPO_SEARCH_URL"],
      build: () => new EuipoClient({ clientId: env.EUIPO_CLIENT_ID!, clientSecret: env.EUIPO_CLIENT_SECRET!, tokenUrl: env.EUIPO_TOKEN_URL!, searchUrl: env.EUIPO_SEARCH_URL! }, http),
    },
    {
      source: "WIPO",
      keys: ["WIPO_API_KEY", "WIPO_SEARCH_URL"],
      build: () => new WipoClient({ apiKey: env.WIPO_API_KEY!, searchUrl: env.WIPO_SEARCH_URL! }, http),
    },
  ];

  for (const g of groups) {
    const { present, missing } = pick(env, g.keys);
    if (present.length === 0) continue; // not configured — skip
    if (missing.length > 0) {
      const msg = `[trademark:${g.source}] partial configuration — missing ${missing.join(", ")}. Set all of ${g.keys.join(", ")} or none.`;
      if (isProd) throw new Error(msg);
      if (typeof console !== "undefined") console.warn(msg + " (skipped in non-production)");
      continue;
    }
    clients.push(g.build());
  }
  return clients;
}

export function registriesConfigured(env: Env = process.env): boolean {
  try {
    return getConfiguredRegistries(env, DEFAULT_HTTP).length > 0;
  } catch {
    return true; // partial config exists (will throw in prod) — treat as "configured"
  }
}

/**
 * Search every registry for a term and merge results, de-duped by
 * (source, ref). A registry that errors is dropped (best-effort) — the
 * caller decides "unavailable" vs "clear" from the merged set + the local
 * table. Returns { marks, errors } so the audit trail records partial
 * failures.
 */
export async function searchAllRegistries(
  clients: TrademarkRegistryClient[],
  term: string,
  classes: number[],
): Promise<{ marks: RegistryMark[]; errors: Array<{ source: string; error: string }> }> {
  const settled = await Promise.allSettled(clients.map((c) => c.searchMarks(term, classes)));
  const marks: RegistryMark[] = [];
  const errors: Array<{ source: string; error: string }> = [];
  const seen = new Set<string>();
  settled.forEach((s, i) => {
    const src = clients[i]!.source;
    if (s.status === "fulfilled") {
      for (const m of s.value) {
        const key = `${m.source}:${m.ref}`;
        if (!seen.has(key)) { seen.add(key); marks.push(m); }
      }
    } else {
      errors.push({ source: src, error: String(s.reason?.message || s.reason) });
    }
  });
  return { marks, errors };
}
