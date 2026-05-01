import { describe, expect, it } from "vitest";
import {
  CloseoutChecklistIncompleteError,
  assertCloseoutComplete,
  markCompleted,
  readChecklist,
} from "../src/internal/services/closeout";

describe("closeout checklist", () => {
  it("readChecklist normalises raw json", () => {
    const items = readChecklist([
      { key: "a", label: "Alpha" },
      { key: "b", label: "Beta", required: true },
      { wrongShape: true },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ key: "a", required: false });
    expect(items[1]).toMatchObject({ key: "b", required: true });
  });

  it("markCompleted ticks the matching key without mutating others", () => {
    const items = readChecklist([
      { key: "a", label: "Alpha", required: true },
      { key: "b", label: "Beta", required: false },
    ]);
    const after = markCompleted(items, "a", "user-1");
    expect(after[0]?.completed).toBe(true);
    expect(after[0]?.completedBy).toBe("user-1");
    expect(after[1]?.completed).toBe(false);
    // No mutation of the original.
    expect(items[0]?.completed).toBe(false);
  });

  it("assertCloseoutComplete passes when no required items remain incomplete", () => {
    const items = readChecklist([
      { key: "a", label: "Alpha", required: true, completed: true },
      { key: "b", label: "Beta", required: false },
    ]);
    expect(() => assertCloseoutComplete(items)).not.toThrow();
  });

  it("assertCloseoutComplete throws with the specific missing keys", () => {
    const items = readChecklist([
      { key: "a", label: "Alpha", required: true, completed: true },
      { key: "b", label: "Beta", required: true, completed: false },
      { key: "c", label: "Gamma", required: true },
    ]);
    try {
      assertCloseoutComplete(items);
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(CloseoutChecklistIncompleteError);
      const err = e as CloseoutChecklistIncompleteError;
      expect(err.missing).toEqual(["b", "c"]);
    }
  });

  it("non-required items never gate closure", () => {
    const items = readChecklist([
      { key: "a", label: "Alpha", required: false, completed: false },
    ]);
    expect(() => assertCloseoutComplete(items)).not.toThrow();
  });
});
