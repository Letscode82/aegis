/**
 * Dev-mode "View as role" cookie parsing (program #4). The switcher
 * stores the selected seeded-user email in aegis_dev_view_as; the
 * dev-mode getResolvedUser path resolves that user so each team can
 * preview their own view. Pure parsing only here.
 */
import { describe, expect, it } from "vitest";
import { parseDevViewAsCookie, DEV_VIEW_AS_COOKIE } from "../src/server";

describe("parseDevViewAsCookie()", () => {
  it("extracts the email from a cookie header among others", () => {
    const header = `foo=bar; ${DEV_VIEW_AS_COOKIE}=lena.attorney%40aegis-demo.example; baz=qux`;
    expect(parseDevViewAsCookie(header)).toBe("lena.attorney@aegis-demo.example");
  });

  it("returns null when absent, empty, or the header is missing", () => {
    expect(parseDevViewAsCookie(undefined)).toBeNull();
    expect(parseDevViewAsCookie("")).toBeNull();
    expect(parseDevViewAsCookie("other=1")).toBeNull();
    expect(parseDevViewAsCookie(`${DEV_VIEW_AS_COOKIE}=`)).toBeNull();
  });
});
