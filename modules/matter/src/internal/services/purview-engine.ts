/**
 * PROC-7 — Purview processing mode (dual-mode alongside native / Tika).
 *
 * Design reality: Purview does NOT expose a synchronous bytes→text extractor.
 * It processes and indexes content asynchronously **inside eDiscovery review
 * sets**. So this engine does not re-extract arbitrary bytes itself — for
 * direct-collected bytes it delegates to a base extractor (Tika if configured,
 * else native). Reading back Purview's own indexed text for items collected
 * through a Purview review set is **PROC-7b**, which needs a live E5 tenant to
 * build and test and is intentionally out of this increment.
 *
 * What ships here (PROC-7a): the mode seam + a license/connection gate so an
 * org set to `purview` is only treated as Purview-capable when its delegated
 * eDiscovery service account is actually connected. When it isn't, the factory
 * falls back to the base engine so collection never stalls.
 */
import { getDelegatedAuthStatus } from "./m365-graph-delegated-auth";
import type { ProcessingEngine, ProcessingExtractInput, ProcessingResult } from "./processing";

export class PurviewProcessingEngine implements ProcessingEngine {
  readonly name = "purview";
  constructor(private readonly base: ProcessingEngine) {}

  bodyToText(html: string | null | undefined, contentType?: string | null): string | null {
    return this.base.bodyToText(html, contentType);
  }

  async extract(input: ProcessingExtractInput): Promise<ProcessingResult> {
    // PROC-7b will replace this with a review-set read-back of Purview's
    // indexed text. Until then, direct-byte extraction uses the base engine.
    return this.base.extract(input);
  }
}

export interface PurviewProcessingStatus {
  /** True only when a delegated eDiscovery service account is authorized and not expired. */
  connected: boolean;
  accountUpn: string | null;
  expired: boolean;
  /** Human-readable reason when not connected — surfaced in the health probe. */
  reason: string | null;
}

/**
 * The Purview license/connection gate. Purview processing needs the delegated
 * eDiscovery service account (E5 + eDiscovery Premium, connected via the
 * `/admin/m365` Device Code flow from sub-PR 4c.1). This reuses that status.
 */
export async function getPurviewProcessingStatus(organizationId?: string): Promise<PurviewProcessingStatus> {
  if (!organizationId) {
    return { connected: false, accountUpn: null, expired: false, reason: "no organization in context" };
  }
  const d = await getDelegatedAuthStatus(organizationId).catch(() => null);
  if (!d || !d.configured) {
    return {
      connected: false,
      accountUpn: null,
      expired: false,
      reason: "eDiscovery service account not connected — connect it under Admin → M365 (delegated authorization)",
    };
  }
  if (d.expired) {
    return {
      connected: false,
      accountUpn: d.accountUpn,
      expired: true,
      reason: d.lastRefreshError ?? "delegated authorization expired — re-authorize under Admin → M365",
    };
  }
  return { connected: true, accountUpn: d.accountUpn, expired: false, reason: null };
}
