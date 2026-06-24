/**
 * Bootstrap sanctions data for demo / CI / first-boot.
 *
 * These are genuinely OFAC-listed names (public SDN / sectoral data), so
 * the screening table holds real reference data out of the box and the
 * vendor agent returns real "hit" / "clear" verdicts in the demo.
 *
 * PRODUCTION SWAP: refreshSanctionsList() takes a pluggable fetcher.
 * Point it at the live US Treasury SDN feed
 * (https://www.treasury.gov/ofac/downloads/sdn.xml or the consolidated
 * JSON) in a deployed environment — the admin refresh trigger and the
 * screening logic don't change, only the fetcher. Until that's wired,
 * this bootstrap keeps screening honest (real matches) while the
 * staleness guard ensures a never-refreshed prod list reads as
 * "unavailable" → flag-for-review rather than a false all-clear.
 */
import type { RawSanctionsEntry, SanctionsFeedFetcher } from "./server";

export const BOOTSTRAP_SANCTIONS_ENTRIES: RawSanctionsEntry[] = [
  { source: "BOOTSTRAP", sourceRef: "sb-sberbank", entityName: "Sberbank of Russia", entityType: "entity", programs: ["RUSSIA-EO14024"], aliases: ["Sberbank", "PJSC Sberbank"], country: "Russia" },
  { source: "BOOTSTRAP", sourceRef: "sb-vtb", entityName: "VTB Bank", entityType: "entity", programs: ["RUSSIA-EO14024"], aliases: ["VTB", "Bank VTB"], country: "Russia" },
  { source: "BOOTSTRAP", sourceRef: "sb-rostec", entityName: "Rostec", entityType: "entity", programs: ["RUSSIA-EO14024"], aliases: ["Rostec State Corporation"], country: "Russia" },
  { source: "BOOTSTRAP", sourceRef: "sb-huawei-tech", entityName: "Huawei Technologies", entityType: "entity", programs: ["NS-CMIC"], aliases: ["Huawei"], country: "China" },
  { source: "BOOTSTRAP", sourceRef: "sb-zte", entityName: "ZTE Corporation", entityType: "entity", programs: ["NS-CMIC"], aliases: ["ZTE"], country: "China" },
  { source: "BOOTSTRAP", sourceRef: "sb-smic", entityName: "Semiconductor Manufacturing International Corporation", entityType: "entity", programs: ["NS-CMIC"], aliases: ["SMIC"], country: "China" },
  { source: "BOOTSTRAP", sourceRef: "sb-tasnim", entityName: "Tasnim News Agency", entityType: "entity", programs: ["IRAN"], aliases: ["Tasnim"], country: "Iran" },
  { source: "BOOTSTRAP", sourceRef: "sb-irgc", entityName: "Islamic Revolutionary Guard Corps", entityType: "entity", programs: ["SDGT", "IRAN"], aliases: ["IRGC"], country: "Iran" },
  { source: "BOOTSTRAP", sourceRef: "sb-wagner", entityName: "Wagner Group", entityType: "entity", programs: ["RUSSIA-EO14024", "TCO"], aliases: ["PMC Wagner", "Wagner"], country: "Russia" },
  { source: "BOOTSTRAP", sourceRef: "sb-lazarus", entityName: "Lazarus Group", entityType: "entity", programs: ["DPRK", "CYBER"], aliases: ["Lazarus", "Hidden Cobra"], country: "North Korea" },
  { source: "BOOTSTRAP", sourceRef: "sb-tornado", entityName: "Tornado Cash", entityType: "entity", programs: ["CYBER"], aliases: ["Tornado.Cash"], country: null },
  { source: "BOOTSTRAP", sourceRef: "sb-garantex", entityName: "Garantex", entityType: "entity", programs: ["CYBER"], aliases: ["Garantex Europe OU"], country: "Russia" },
];

/** A SanctionsFeedFetcher that returns the bootstrap set. Used by the
 * seed and as the default refresh source until the live feed is wired. */
export const bootstrapFetcher: SanctionsFeedFetcher = async () =>
  BOOTSTRAP_SANCTIONS_ENTRIES;
