/**
 * @aegis/documents — shared document capabilities.
 *
 * Agent deliverable rendering: turn an agent's structured
 * recommendation into a professional Word (.docx) document the
 * reviewer downloads and (after human approval) shares with the
 * client / counterparty. One renderer serves every agent.
 */
export {
  renderAgentDeliverableDocx,
  deliverableFilename,
  type DeliverableInput,
} from "./deliverable";

export {
  renderContractDocx,
  contractDocxFilename,
  type ContractDocInput,
} from "./contract-docx";

// Generic Markdown → .docx for free-form console/canvas drafts (CW-4).
export {
  renderMarkdownDocx,
  markdownDocxFilename,
  type MarkdownDocInput,
} from "./markdown-docx";

// Redline (track-changes) .docx — real Word revisions from redline segments (C-1).
export {
  renderRedlineDocx,
  redlineDocxFilename,
  type RedlineDocInput,
  type RedlineSegment,
  type RedlineSegmentType,
} from "./redline-docx";

// Document text extraction (.txt / .docx / .pdf → text). Dependency-free.
export {
  extractDocumentText,
  detectFormat,
  docxXmlToText,
  extractDocxText,
  extractPdfText,
  UnsupportedDocumentFormatError,
  DocumentParseError,
  type DocumentFormat,
  type ExtractedDocument,
} from "./extract";
