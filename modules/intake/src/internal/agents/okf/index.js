// oKF public surface (client-safe): serializer, runtime, static defs.
// The server-only store (Prisma) is exported separately via
// "@aegis/intake/agent-designer".
export {
  canonicalStringify,
  serializeDocument,
  normalizeDocument,
  parseDocument,
} from "./serialize";
export { OKF_VERSION, validateOkfDocument } from "./schema";
export {
  fromRoutingJson,
  renderTemplate,
  renderKnowledge,
  selectItemsForTicket,
  mapConfidenceToAction,
  buildPromptContext,
  runDefinition,
} from "./runtime";
export { STATIC_AGENT_DEFS, staticDefForKey } from "./static-defs";
