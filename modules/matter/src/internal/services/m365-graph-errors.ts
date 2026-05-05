/**
 * Typed errors for the Graph integration. Callers can branch on
 * these to decide policy (reschedule via pg-boss, escalate, fall
 * back to non-Graph preservation).
 */

export class M365GraphError extends Error {
  /** Graph correlation id from `request-id` / `client-request-id` header. */
  public readonly correlationId: string | null;
  /** Endpoint that failed (e.g. `/security/cases/ediscoveryCases`). */
  public readonly endpoint: string | null;
  /** HTTP status code, if any. */
  public readonly statusCode: number | null;
  constructor(
    message: string,
    opts: {
      correlationId?: string | null;
      endpoint?: string | null;
      statusCode?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "M365GraphError";
    this.correlationId = opts.correlationId ?? null;
    this.endpoint = opts.endpoint ?? null;
    this.statusCode = opts.statusCode ?? null;
  }
}

/**
 * 401/Unauthorized from Graph — credentials are bad, expired, or
 * revoked. Surfaces to the admin /admin/m365 page so the operator
 * can rotate the secret.
 */
export class M365GraphAuthError extends M365GraphError {
  constructor(
    message: string,
    opts: {
      correlationId?: string | null;
      endpoint?: string | null;
      statusCode?: number | null;
    } = {},
  ) {
    super(message, opts);
    this.name = "M365GraphAuthError";
  }
}

/**
 * 403 on `/security/cases/...` — the tenant lacks E5 + eDiscovery
 * Premium licensing. The Legal Hold workflow falls back to non-Graph
 * preservation actions (COPIED_TO_PRESERVATION_VAULT,
 * THIRD_PARTY_COLLECTION_PENDING). The defensibility scorecard
 * surfaces the gap as a structured component.
 */
export class M365EDiscoveryNotLicensedError extends M365GraphError {
  constructor(
    message: string,
    opts: {
      correlationId?: string | null;
      endpoint?: string | null;
      statusCode?: number | null;
    } = {},
  ) {
    super(message, opts);
    this.name = "M365EDiscoveryNotLicensedError";
  }
}

/**
 * 429 after final retry. The throttle middleware respects
 * `Retry-After` and applies exponential backoff with jitter for 5xx;
 * if the retry budget is exhausted, this surfaces. Callers should
 * reschedule via pg-boss rather than fail the legal-hold operation.
 */
export class M365ThrottleExceededError extends M365GraphError {
  /** Seconds the upstream asked us to wait, if any. */
  public readonly retryAfterSeconds: number | null;
  constructor(
    message: string,
    opts: {
      correlationId?: string | null;
      endpoint?: string | null;
      statusCode?: number | null;
      retryAfterSeconds?: number | null;
    } = {},
  ) {
    super(message, opts);
    this.name = "M365ThrottleExceededError";
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
  }
}

/**
 * Network unreachable to Graph endpoint. Distinct from auth/license
 * errors so the operator can branch on "is this our config or theirs".
 */
export class M365TenantUnreachableError extends M365GraphError {
  constructor(
    message: string,
    opts: {
      correlationId?: string | null;
      endpoint?: string | null;
    } = {},
  ) {
    super(message, opts);
    this.name = "M365TenantUnreachableError";
  }
}

/**
 * Sub-PR 4c.1 — eDiscovery operation called but no delegated-auth
 * refresh token is stored for the org. The admin must run the Device
 * Code flow at /admin/m365 before eDiscovery operations can proceed.
 *
 * In production (NODE_ENV=production) this error is fatal; in dev
 * the factory falls back to MockM365Client so the workflow stays
 * walkable without external creds.
 */
export class M365DelegatedAuthRequiredError extends M365GraphError {
  constructor(
    message: string,
    opts: {
      correlationId?: string | null;
      endpoint?: string | null;
    } = {},
  ) {
    super(message, opts);
    this.name = "M365DelegatedAuthRequiredError";
  }
}

/**
 * Sub-PR 4c.1 — the stored delegated refresh token was rejected by
 * Microsoft (rotated password, MFA re-enrollment, revoked token).
 * Surfaces in /admin/m365 as a re-authorize banner.
 */
export class M365DelegatedAuthExpiredError extends M365GraphError {
  /** Microsoft AADSTS code if recoverable, else null. */
  public readonly upstreamCode: string | null;
  /** Human-readable message from Microsoft if available. */
  public readonly upstreamMessage: string | null;
  /** Last successful refresh, for the admin UI banner. */
  public readonly lastWorkingAt: Date | null;
  constructor(
    message: string,
    opts: {
      correlationId?: string | null;
      endpoint?: string | null;
      upstreamCode?: string | null;
      upstreamMessage?: string | null;
      lastWorkingAt?: Date | null;
    } = {},
  ) {
    super(message, opts);
    this.name = "M365DelegatedAuthExpiredError";
    this.upstreamCode = opts.upstreamCode ?? null;
    this.upstreamMessage = opts.upstreamMessage ?? null;
    this.lastWorkingAt = opts.lastWorkingAt ?? null;
  }
}

/**
 * Resource not found at the Graph endpoint (e.g. eDiscovery custodian
 * id no longer exists because the case was deleted out-of-band).
 * Distinct from auth so callers can decide whether to recreate.
 */
export class M365GraphNotFoundError extends M365GraphError {
  constructor(
    message: string,
    opts: {
      correlationId?: string | null;
      endpoint?: string | null;
      statusCode?: number | null;
    } = {},
  ) {
    super(message, opts);
    this.name = "M365GraphNotFoundError";
  }
}

/**
 * Maps a Graph SDK error to one of the typed errors above. Inspects
 * the error's `statusCode`, response body / message keywords, and the
 * endpoint that produced it. Generic Graph errors fall through as
 * `M365GraphError` so callers always have something to branch on.
 */
export function mapGraphError(
  err: unknown,
  endpoint: string | null,
): M365GraphError {
  // The Graph SDK throws errors with a `.statusCode` and `.code`
  // (string error code) on the GraphError class. We don't depend on
  // the type directly — duck-type for portability against SDK
  // version drift.
  const e = err as {
    statusCode?: number;
    code?: string;
    message?: string;
    requestId?: string;
    body?: string;
  };
  const statusCode = typeof e.statusCode === "number" ? e.statusCode : null;
  const correlationId = typeof e.requestId === "string" ? e.requestId : null;
  const baseMessage =
    typeof e.message === "string" ? e.message : "Graph call failed";

  if (statusCode === 401) {
    return new M365GraphAuthError(`Unauthorized: ${baseMessage}`, {
      correlationId,
      endpoint,
      statusCode,
    });
  }
  if (statusCode === 403) {
    // 403 on /security/* with body mentioning license/SKU is the
    // E5-not-licensed signal. Otherwise it's an auth/permission gap.
    const looksLikeLicense =
      (endpoint?.startsWith("/security/cases") ?? false) ||
      /license|sku|premium|eDiscovery/.test(baseMessage) ||
      /license|sku|premium|eDiscovery/.test(e.body ?? "");
    if (looksLikeLicense) {
      return new M365EDiscoveryNotLicensedError(
        `eDiscovery Premium licensing absent on the tenant: ${baseMessage}`,
        { correlationId, endpoint, statusCode },
      );
    }
    return new M365GraphAuthError(`Forbidden: ${baseMessage}`, {
      correlationId,
      endpoint,
      statusCode,
    });
  }
  if (statusCode === 404) {
    return new M365GraphNotFoundError(`Not found: ${baseMessage}`, {
      correlationId,
      endpoint,
      statusCode,
    });
  }
  if (statusCode === 429) {
    // The middleware should normally absorb 429 — if we see it here,
    // the retry budget was exhausted.
    return new M365ThrottleExceededError(
      `Throttled by Graph after exhausting retries: ${baseMessage}`,
      { correlationId, endpoint, statusCode },
    );
  }
  if (
    e.code === "ENOTFOUND" ||
    e.code === "ECONNREFUSED" ||
    e.code === "ETIMEDOUT"
  ) {
    return new M365TenantUnreachableError(
      `Cannot reach Graph endpoint: ${baseMessage}`,
      { correlationId, endpoint },
    );
  }
  return new M365GraphError(baseMessage, {
    correlationId,
    endpoint,
    statusCode,
  });
}
