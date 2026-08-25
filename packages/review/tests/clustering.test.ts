import { describe, it, expect } from "vitest";
import { clusterDocuments } from "../src/clustering";

describe("clusterDocuments", () => {
  it("groups documents that share vocabulary and separates distinct themes", () => {
    const docs = [
      { id: "p1", title: "VendorX pricing model", excerpt: "the pricing model and discount schedule for vendorx" },
      { id: "p2", title: "Re: pricing model", excerpt: "updated pricing model numbers for vendorx discount" },
      { id: "s1", title: "Source code access", excerpt: "engineer downloaded source code repository access logs" },
      { id: "s2", title: "repository source code", excerpt: "source code repository export and access review" },
    ];
    const clusters = clusterDocuments(docs, { threshold: 0.15 });
    // The two pricing docs land together; the two source-code docs land together.
    const clusterOf = (id: string) => clusters.find((c) => c.docIds.includes(id))!.id;
    expect(clusterOf("p1")).toBe(clusterOf("p2"));
    expect(clusterOf("s1")).toBe(clusterOf("s2"));
    expect(clusterOf("p1")).not.toBe(clusterOf("s1"));
  });

  it("labels a cluster from its top terms", () => {
    const docs = [
      { id: "a", title: "pricing pricing pricing", excerpt: "discount discount" },
      { id: "b", title: "pricing discount", excerpt: "pricing discount" },
    ];
    const [c] = clusterDocuments(docs, { threshold: 0.1 });
    expect(c!.topTerms).toContain("pricing");
    expect(c!.label.toLowerCase()).toContain("pricing");
  });

  it("collapses empty-text docs into an Uncategorized cluster", () => {
    const docs = [
      { id: "x", title: "", excerpt: "" },
      { id: "y", title: "   ", excerpt: null },
      { id: "z", title: "pricing model vendorx", excerpt: "pricing" },
    ];
    const clusters = clusterDocuments(docs);
    const uncat = clusters.find((c) => c.id === "cluster-uncategorized");
    expect(uncat).toBeTruthy();
    expect(uncat!.docIds.sort()).toEqual(["x", "y"]);
  });

  it("returns [] for no docs and is deterministic across runs", () => {
    expect(clusterDocuments([])).toEqual([]);
    const docs = [
      { id: "a", title: "alpha beta gamma", excerpt: "alpha beta" },
      { id: "b", title: "delta epsilon", excerpt: "delta epsilon zeta" },
      { id: "c", title: "alpha beta", excerpt: "gamma alpha" },
    ];
    expect(JSON.stringify(clusterDocuments(docs))).toBe(JSON.stringify(clusterDocuments(docs)));
  });

  it("respects the maxClusters cap", () => {
    const docs = Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, title: `uniqueterm${i} word${i}`, excerpt: `body${i} distinct${i}` }));
    const clusters = clusterDocuments(docs, { threshold: 0.9, maxClusters: 3 });
    expect(clusters.length).toBeLessThanOrEqual(3);
    // every doc still assigned
    expect(clusters.reduce((n, c) => n + c.size, 0)).toBe(8);
  });
});
