import { describe, it, expect } from "vitest";
import type { ContractStatus } from "@aegis/db";
import {
  canTransitionContract,
  assertContractTransition,
  allowedContractTransitions,
  IllegalContractTransitionError,
} from "../src/internal/contract-state-machine";

describe("contract state machine", () => {
  it("permits the happy-path lifecycle", () => {
    const path: ContractStatus[] = [
      "DRAFT",
      "IN_NEGOTIATION",
      "IN_REVIEW",
      "APPROVED",
      "EXECUTED",
      "ACTIVE",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionContract(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("allows renew: EXPIRED → ACTIVE and amend: ACTIVE → IN_NEGOTIATION", () => {
    expect(canTransitionContract("EXPIRED", "ACTIVE")).toBe(true);
    expect(canTransitionContract("ACTIVE", "IN_NEGOTIATION")).toBe(true);
  });

  it("allows terminate from every non-terminal state", () => {
    const nonTerminal: ContractStatus[] = [
      "DRAFT",
      "IN_NEGOTIATION",
      "IN_REVIEW",
      "APPROVED",
      "EXECUTED",
      "ACTIVE",
      "EXPIRED",
    ];
    for (const s of nonTerminal) expect(canTransitionContract(s, "TERMINATED")).toBe(true);
  });

  it("TERMINATED is terminal", () => {
    expect(allowedContractTransitions("TERMINATED")).toEqual([]);
    expect(canTransitionContract("TERMINATED", "ACTIVE")).toBe(false);
  });

  it("rejects illegal skips (DRAFT → EXECUTED, ACTIVE → DRAFT)", () => {
    expect(canTransitionContract("DRAFT", "EXECUTED")).toBe(false);
    expect(canTransitionContract("ACTIVE", "DRAFT")).toBe(false);
  });

  it("assertContractTransition throws IllegalContractTransitionError with from/to", () => {
    try {
      assertContractTransition("DRAFT", "ACTIVE");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalContractTransitionError);
      expect((e as IllegalContractTransitionError).from).toBe("DRAFT");
      expect((e as IllegalContractTransitionError).to).toBe("ACTIVE");
    }
  });
});
