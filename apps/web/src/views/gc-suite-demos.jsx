import { C } from "@aegis/ui";

// GC Suite embedded demos.
//
// Two self-contained, de-branded HTML demos ship under
// apps/web/public/gc-suite/ and are surfaced as first-class nav tiles:
//
//   • company-brain.html — "AEGIS Legal Brain": five source systems
//     resolved into one legal memory, entity resolution, cross-system
//     queries answered in seconds.
//   • regulatory.html — "Regulatory Nervous System": obligation
//     register, control crosswalk, Statement of Applicability, horizon
//     scanning, conflict-of-law, filing calendar.
//
// They render inside a full-bleed iframe so the demo owns its own
// layout/scroll while still living behind the AEGIS side-nav. Keeping
// them as static assets (rather than porting to React) preserves the
// exact interaction design the demos were tuned for, and keeps the
// bundle free of their inline scripts/styles.

function DemoFrame({ src, title }) {
  return (
    <div
      style={{
        // Cancel the 18px content padding so the demo is edge-to-edge,
        // and reserve the top-bar height so nothing is clipped.
        margin: -18,
        height: "calc(100vh - 56px)",
        background: C.bg,
      }}
    >
      <iframe
        src={src}
        title={title}
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}

export function BrainDemoView() {
  return <DemoFrame src="/gc-suite/company-brain.html" title="AEGIS Legal Brain" />;
}

export function RegulatoryDemoView() {
  return <DemoFrame src="/gc-suite/regulatory.html" title="Regulatory Nervous System" />;
}
