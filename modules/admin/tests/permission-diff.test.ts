import { describe, expect, it } from "vitest";
import { Permission } from "@aegis/auth";
import { diffPermissions } from "../src/internal/services/roles";

describe("diffPermissions", () => {
  it("returns added + removed sets", () => {
    const before = [
      Permission.MatterReadAll,
      Permission.MatterCreate,
      Permission.MatterUpdate,
    ];
    const after = [
      Permission.MatterReadAll,
      Permission.MatterUpdate,
      Permission.MatterClose,
    ];
    const { added, removed } = diffPermissions(before, after);
    expect(added).toEqual([Permission.MatterClose]);
    expect(removed).toEqual([Permission.MatterCreate]);
  });

  it("empty diff for identical sets", () => {
    const set = [Permission.IntakeReadAllTickets, Permission.MatterReadAll];
    const { added, removed } = diffPermissions(set, set);
    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("treats undefined-style empty arrays correctly", () => {
    const before: Permission[] = [];
    const after = [Permission.AdminManageUsers, Permission.AdminManageRoles];
    const d = diffPermissions(before, after);
    expect(d.added).toHaveLength(2);
    expect(d.removed).toEqual([]);
  });
});
