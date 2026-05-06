/**
 * DataSourceList — header + list of one custodian's mapped data
 * sources, plus the `+ Add data source` affordance which opens the
 * three-mode `DataSourceAddDialog`.
 *
 * Stateless: parent owns the sources array (so adds reflect against
 * the same fetch the panel uses); this component just renders.
 */
import React, { useState } from "react";
import { C, F, M } from "@aegis/ui";
import { DataSourceAddDialog } from "./DataSourceAddDialog";
import { DataSourceRow } from "./DataSourceRow";
import type { HoldDataSourceDTO } from "./types";

export interface DataSourceListProps {
  matterId: string;
  holdId: string;
  custodianPersonId: string;
  custodianName: string;
  sources: HoldDataSourceDTO[];
  canMutate: boolean;
  busy: boolean;
  onApply: (dsId: string) => void;
  onConfirm: (dsId: string) => void;
  onAdded: () => void;
}

export const DataSourceList: React.FC<DataSourceListProps> = ({
  matterId,
  holdId,
  custodianPersonId,
  custodianName,
  sources,
  canMutate,
  busy,
  onApply,
  onConfirm,
  onAdded,
}) => {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: M,
            fontSize: 9.5,
            color: C.t3,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Data sources ({sources.length})
        </span>
        {canMutate && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            style={{
              background: "transparent",
              border: `1px solid ${C.bl}55`,
              color: C.bl,
              padding: "3px 10px",
              borderRadius: 4,
              fontSize: 10,
              fontFamily: F,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            + Add data source
          </button>
        )}
      </div>

      {sources.length === 0 ? (
        <div
          style={{
            color: C.t4,
            fontSize: 10.5,
            fontFamily: M,
            padding: "10px 6px",
            border: `1px dashed ${C.br}`,
            borderRadius: 4,
            textAlign: "center",
          }}
        >
          No data sources mapped to this custodian.
          {canMutate && " Click + Add data source to map preservation targets."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          {sources.map((d) => (
            <DataSourceRow
              key={d.id}
              source={d}
              canMutate={canMutate}
              busy={busy}
              onApply={onApply}
              onConfirm={onConfirm}
              matterId={matterId}
              holdId={holdId}
              personId={custodianPersonId}
              onAfterRetry={onAdded}
            />
          ))}
        </div>
      )}

      {addOpen && (
        <DataSourceAddDialog
          matterId={matterId}
          holdId={holdId}
          custodianPersonId={custodianPersonId}
          custodianName={custodianName}
          existingExternalIds={new Set(sources.map((s) => s.id))}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            onAdded();
          }}
        />
      )}
    </div>
  );
};
