import { describe, it, expect } from "vitest";
import {
  intakeTypeSpawnsContract,
  deriveContractType,
  deriveContractTitle,
} from "../src/contract-spawn/server";

describe("intakeTypeSpawnsContract", () => {
  it("spawns for contract-bearing intake types", () => {
    expect(intakeTypeSpawnsContract("Contract Review")).toBe(true);
    expect(intakeTypeSpawnsContract("NDA Request")).toBe(true);
  });
  it("does not spawn for advisory / non-contract types", () => {
    expect(intakeTypeSpawnsContract("Contract Question")).toBe(false);
    expect(intakeTypeSpawnsContract("Litigation / Dispute")).toBe(false);
    expect(intakeTypeSpawnsContract(null)).toBe(false);
    expect(intakeTypeSpawnsContract(undefined)).toBe(false);
  });
});

describe("deriveContractType", () => {
  it("NDA Request is always an NDA", () => {
    expect(deriveContractType("NDA Request", "whatever")).toBe("NDA");
  });
  it("recognises instruments in a Contract Review description", () => {
    expect(deriveContractType("Contract Review", "Please review this MSA")).toBe("Master Services Agreement");
    expect(deriveContractType("Contract Review", "New SOW for the vendor")).toBe("Statement of Work");
    expect(deriveContractType("Contract Review", "Software license agreement")).toBe("License Agreement");
    expect(deriveContractType("Contract Review", "DPA for the processor")).toBe("Data Processing Addendum");
  });
  it("defaults to a generic Contract", () => {
    expect(deriveContractType("Contract Review", "some agreement")).toBe("Contract");
  });
});

describe("deriveContractTitle", () => {
  it("uses the first sentence of the description", () => {
    expect(
      deriveContractTitle({ type: "Contract Review", description: "Review the Acme MSA renewal. Urgent.", requesterName: "Jane" }),
    ).toBe("Review the Acme MSA renewal");
  });
  it("falls back to type + requester when empty", () => {
    expect(deriveContractTitle({ type: "NDA Request", description: "", requesterName: "Sam" })).toBe("NDA Request — Sam");
  });
  it("truncates very long first sentences", () => {
    const long = "x".repeat(200);
    const title = deriveContractTitle({ type: "Contract Review", description: long, requesterName: "A" });
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("...")).toBe(true);
  });
});
