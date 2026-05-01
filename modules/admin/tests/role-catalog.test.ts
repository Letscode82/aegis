import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, Permission, ALL_ROLES, ROLE_PERMISSIONS } from "@aegis/auth";
import {
  PERMISSION_GROUPS,
  ROLE_BADGE_COLORS,
  ROLE_DESCRIPTIONS,
  permissionLabel,
} from "../src/internal/services/role-catalog";

describe("permission catalog coverage", () => {
  it("PERMISSION_GROUPS covers every Permission exactly once", () => {
    const collected = PERMISSION_GROUPS.flatMap((g) => g.permissions);
    expect(new Set(collected).size).toBe(collected.length);
    expect(collected.length).toBe(ALL_PERMISSIONS.length);
    for (const p of ALL_PERMISSIONS) {
      expect(collected).toContain(p);
    }
  });

  it("permissionLabel returns a non-empty string for every Permission", () => {
    for (const p of ALL_PERMISSIONS) {
      expect(permissionLabel(p)).toBeTruthy();
    }
  });

  it("ROLE_DESCRIPTIONS + ROLE_BADGE_COLORS cover all 8 canonical roles", () => {
    for (const r of ALL_ROLES) {
      expect(ROLE_DESCRIPTIONS[r]).toBeTruthy();
      expect(ROLE_BADGE_COLORS[r]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("admin role still carries every permission (sanity-check the @aegis/auth invariant)", () => {
    const adminPerms = new Set(ROLE_PERMISSIONS.admin);
    for (const p of ALL_PERMISSIONS) {
      expect(adminPerms.has(p)).toBe(true);
    }
  });
});
