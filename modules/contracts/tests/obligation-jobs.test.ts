import { describe, it, expect } from "vitest";
import { escalationTierForOverdue } from "../src/internal/obligation-jobs";

describe("obligation escalation tiers", () => {
  it("owner for ≤7 days overdue", () => {
    expect(escalationTierForOverdue(0)).toBe("owner");
    expect(escalationTierForOverdue(7)).toBe("owner");
  });
  it("manager for 8–30 days overdue", () => {
    expect(escalationTierForOverdue(8)).toBe("manager");
    expect(escalationTierForOverdue(30)).toBe("manager");
  });
  it("executive beyond 30 days overdue", () => {
    expect(escalationTierForOverdue(31)).toBe("executive");
    expect(escalationTierForOverdue(400)).toBe("executive");
  });
});
