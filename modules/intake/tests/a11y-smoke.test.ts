/** Smoke: W4-4 accessibility primitives. */
import { describe, expect, it } from "vitest";

describe("pressable (@aegis/ui)", () => {
  it("returns a keyboard-operable button bundle", async () => {
    const { pressable } = (await import("@aegis/ui")) as {
      pressable: (fn: () => void, label?: string) => Record<string, unknown>;
    };
    let fired = 0;
    const props = pressable(() => { fired += 1; }, "Do the thing");
    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
    expect(props["aria-label"]).toBe("Do the thing");
    (props.onClick as () => void)();
    expect(fired).toBe(1);
    // Enter and Space activate; other keys don't.
    const key = (k: string) => (props.onKeyDown as (e: unknown) => void)({ key: k, preventDefault: () => {} });
    key("Enter");
    key(" ");
    key("Escape");
    expect(fired).toBe(3);
  });

  it("global CSS carries focus-visible ring + reduced-motion guard", async () => {
    const { CSS } = (await import("@aegis/ui")) as { CSS: string };
    expect(CSS).toContain("focus-visible");
    expect(CSS).toContain("prefers-reduced-motion");
  });
});
