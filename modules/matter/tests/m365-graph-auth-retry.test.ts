/**
 * Sub-PR 4c.1 cleanup — confirm the SDK retry handler is wired into
 * `buildClient` with our throttle policy. The factory's previous
 * implementation passed `middleware: undefined` and discarded the
 * result of `buildRetryHandlerOptions`, so 429/5xx responses bubbled
 * straight to `mapGraphError` after one attempt.
 *
 * The Graph SDK keeps the middleware chain on a private `httpClient`
 * field; we walk it via `(client as any).httpClient.middleware` and
 * traverse `.nextMiddleware` to locate a RetryHandler.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@aegis/db", () => ({
  prisma: {
    organizationM365Credential: {
      findUnique: vi.fn(async () => ({
        organizationId: "org-1",
        tenantId: "tenant-x",
        clientId: "client-x",
        encryptedClientSecret: Buffer.concat([
          Buffer.from("v1pl"),
          Buffer.from("secret-xyz", "utf8"),
        ]),
        isActive: true,
        graphBaseUrl: "https://graph.microsoft.com",
        rotatedAt: null,
      })),
    },
  },
  decryptSecret: (buf: Buffer) => buf.subarray(4).toString("utf8"),
  secretFingerprint: () => "fp-x",
  logAudit: vi.fn(async () => undefined),
}));

import { getGraphClientForOrg } from "../src/internal/services/m365-graph-auth";
import { DEFAULT_THROTTLE_POLICY } from "../src/internal/services/m365-graph-throttle";

interface MaybeMiddleware {
  nextMiddleware?: MaybeMiddleware;
  options?: { delay?: number; maxRetries?: number };
}

function findInChain(
  head: MaybeMiddleware | undefined,
  ctorName: string,
): MaybeMiddleware | null {
  let node: MaybeMiddleware | undefined = head;
  for (let i = 0; node && i < 10; i++) {
    if (node.constructor?.name === ctorName) return node;
    node = node.nextMiddleware;
  }
  return null;
}

describe("buildClient — retry middleware wiring", () => {
  it("installs a RetryHandler whose options match DEFAULT_THROTTLE_POLICY", async () => {
    const resolved = await getGraphClientForOrg("org-1");
    expect(resolved).not.toBeNull();
    const client = resolved!.client as unknown as {
      httpClient: { middleware: MaybeMiddleware };
    };
    const retry = findInChain(client.httpClient.middleware, "RetryHandler");
    expect(retry).not.toBeNull();
    // The SDK's RetryHandlerOptions takes seconds for `delay`. Our
    // policy is in ms; the constructor receives policy.backoffBaseMs / 1000.
    const opts = (retry as { options?: { delay?: number; maxRetries?: number } })
      .options;
    expect(opts?.maxRetries).toBe(DEFAULT_THROTTLE_POLICY.maxRetries);
    expect(opts?.delay).toBe(DEFAULT_THROTTLE_POLICY.backoffBaseMs / 1000);
  });
});
