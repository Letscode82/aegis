/**
 * Sub-PR 4d.0 — pagination helper unit tests.
 *
 * `enumerateDataSourcesForUser` was failing in production with
 * "Query option 'Top' is not allowed." The pagination helper
 * replaces $top with native @odata.nextLink walking; these tests
 * confirm both the all-pages and first-page-only paths.
 */
import { describe, expect, it, vi } from "vitest";
import type { Client } from "@microsoft/microsoft-graph-client";
import {
  fetchAllPaged,
  fetchFirstPage,
} from "../src/internal/services/m365-graph-pagination";

function fakeGraph(pages: Record<string, unknown>): Client {
  return {
    api: (path: string) => ({
      get: async () => pages[path] ?? { value: [] },
    }),
  } as unknown as Client;
}

describe("fetchAllPaged", () => {
  it("walks two pages via @odata.nextLink", async () => {
    const graph = fakeGraph({
      "/users/u1/joinedTeams": {
        value: [{ id: "t1" }, { id: "t2" }],
        "@odata.nextLink": "/users/u1/joinedTeams?$skiptoken=ABC",
      },
      "/users/u1/joinedTeams?$skiptoken=ABC": {
        value: [{ id: "t3" }],
      },
    });
    const all = await fetchAllPaged<{ id: string }>(graph, "/users/u1/joinedTeams");
    expect(all.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("returns [] when value is missing or empty", async () => {
    const graph = fakeGraph({ "/users/u1/joinedTeams": {} });
    const all = await fetchAllPaged(graph, "/users/u1/joinedTeams");
    expect(all).toEqual([]);
  });

  it("respects maxPages cap to defend against cyclic nextLinks", async () => {
    const responses: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) {
      responses[`/p${i}`] = {
        value: [{ id: i }],
        "@odata.nextLink": `/p${i + 1}`,
      };
    }
    const graph = fakeGraph(responses);
    const all = await fetchAllPaged<{ id: number }>(graph, "/p0", { maxPages: 3 });
    expect(all.map((p) => p.id)).toEqual([0, 1, 2]);
  });
});

describe("fetchFirstPage", () => {
  it("returns first-page values without following nextLink", async () => {
    const followCalled = vi.fn();
    const graph = {
      api: (path: string) => {
        if (path !== "/users/u1/chats") {
          followCalled(path);
        }
        return {
          get: async () => ({
            value: [{ id: "c1" }],
            "@odata.nextLink": "/users/u1/chats?$skiptoken=BAD",
          }),
        };
      },
    } as unknown as Client;
    const first = await fetchFirstPage<{ id: string }>(graph, "/users/u1/chats");
    expect(first).toEqual([{ id: "c1" }]);
    expect(followCalled).not.toHaveBeenCalled();
  });
});
