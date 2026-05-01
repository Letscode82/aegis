/**
 * Hold AI client (sub-PR 4b — sunset 4d).
 *
 * The interface ships in 4b so caller surfaces (custodian
 * recommendations, cadence picker, notice drafting, scorecard
 * narrative) wire against a stable shape. The 4d sub-PR replaces
 * `MockHoldAIClient` with `@aegis/ai`-routed Claude calls and writes
 * `AgentDecision` rows for each recommendation; the interface stays
 * unchanged.
 *
 * In 4b every recommendation returns deterministic placeholder data.
 * `confidence` is null (signals "no model behind this — do not show
 * a confidence percentage in the UI").
 */
import { sha256Hex } from "@aegis/db";
import type { CandidateCustodian } from "../../services/m365";
import type { HoldDefensibilityScore } from "../types";

export interface HoldAIRecommendation<T> {
  payload: T;
  /** null = deterministic mock; 4d returns real values 0..1. */
  confidence: number | null;
  modelId: string;
  modelVersion: string;
  promptHash: string;
  retrievedContextHash: string | null;
}

export interface HoldAIClient {
  /** D1 — recommend custodians from a free-text scope description. */
  recommendCustodians(input: {
    scope: string;
    matterId: string;
  }): Promise<HoldAIRecommendation<CandidateCustodian[]>>;

  /** D2 — predict re-acknowledgment cadence for a hold's risk profile. */
  recommendCadence(input: {
    matterId: string;
    jurisdictions: string[];
  }): Promise<HoldAIRecommendation<{ cadenceDays: number; rationale: string }>>;

  /** Draft jurisdiction-aware notice from template + scope. */
  draftNotice(input: {
    templateId: string;
    scope: string;
    jurisdictions: string[];
  }): Promise<HoldAIRecommendation<{ bodyMarkdown: string }>>;

  /** D6 — narrative explanation of the deterministic scorecard. */
  explainScorecard(input: {
    holdId: string;
    score: HoldDefensibilityScore;
  }): Promise<HoldAIRecommendation<{ narrativeMarkdown: string }>>;
}

export class MockHoldAIClient implements HoldAIClient {
  async recommendCustodians(input: {
    scope: string;
    matterId: string;
  }): Promise<HoldAIRecommendation<CandidateCustodian[]>> {
    const promptHash = sha256Hex(JSON.stringify(input));
    // Keyword-shaped placeholders. Order is stable so test fixtures
    // line up.
    const payload: CandidateCustodian[] = [
      {
        externalIdentifier: "custodian:vp-eng-001",
        name: "Priya Kulkarni",
        email: "priya.kulkarni@aegis-demo.example",
        department: "Engineering",
        title: "VP Engineering",
        matchConfidence: 0.92,
        matchRationale: "Named in scope description (mock)",
      },
      {
        externalIdentifier: "custodian:team-lead-002",
        name: "Marcus Reid",
        email: "marcus.reid@aegis-demo.example",
        department: "Engineering",
        title: "Team Lead",
        matchConfidence: 0.78,
        matchRationale: "Direct report to VP Engineering (mock)",
      },
    ];
    return {
      payload,
      confidence: null,
      modelId: "mock",
      modelVersion: "0",
      promptHash,
      retrievedContextHash: null,
    };
  }

  async recommendCadence(input: {
    matterId: string;
    jurisdictions: string[];
  }): Promise<HoldAIRecommendation<{ cadenceDays: number; rationale: string }>> {
    const promptHash = sha256Hex(JSON.stringify(input));
    // GDPR jurisdictions trigger the conservative 60-day default.
    const cadenceDays = input.jurisdictions.includes("EU") ? 60 : 90;
    return {
      payload: {
        cadenceDays,
        rationale: input.jurisdictions.includes("EU")
          ? "EU jurisdiction detected — Schrems II + GDPR Art. 5 favour shorter cadence (mock)."
          : "US-only matter — 90-day cadence is the standard org default (mock).",
      },
      confidence: null,
      modelId: "mock",
      modelVersion: "0",
      promptHash,
      retrievedContextHash: null,
    };
  }

  async draftNotice(input: {
    templateId: string;
    scope: string;
    jurisdictions: string[];
  }): Promise<HoldAIRecommendation<{ bodyMarkdown: string }>> {
    const promptHash = sha256Hex(JSON.stringify(input));
    const bodyMarkdown = [
      "# Legal Hold Notice (DRAFT — mock)",
      "",
      `Scope: ${input.scope}`,
      "",
      `Jurisdictions: ${input.jurisdictions.join(", ") || "(none)"}`,
      "",
      "You must preserve all data falling within the above scope until further notice.",
    ].join("\n");
    return {
      payload: { bodyMarkdown },
      confidence: null,
      modelId: "mock",
      modelVersion: "0",
      promptHash,
      retrievedContextHash: null,
    };
  }

  async explainScorecard(input: {
    holdId: string;
    score: HoldDefensibilityScore;
  }): Promise<HoldAIRecommendation<{ narrativeMarkdown: string }>> {
    const promptHash = sha256Hex(JSON.stringify(input));
    const narrative = [
      `# Defensibility narrative for hold ${input.holdId} (mock)`,
      "",
      `Overall score: **${input.score.score}/100**.`,
      "",
      "Top gaps:",
      ...input.score.gaps
        .slice(0, 3)
        .map((g) => `- ${g.severity.toUpperCase()}: ${g.message}`),
      "",
      "_AI narrative ships in 4d; this is a deterministic structured summary._",
    ].join("\n");
    return {
      payload: { narrativeMarkdown: narrative },
      confidence: null,
      modelId: "mock",
      modelVersion: "0",
      promptHash,
      retrievedContextHash: null,
    };
  }
}

let _client: HoldAIClient | null = null;
export function getHoldAIClient(): HoldAIClient {
  if (!_client) _client = new MockHoldAIClient();
  return _client;
}
