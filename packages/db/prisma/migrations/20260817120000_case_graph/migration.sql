-- CAP-3: Case Knowledge Graph (nodes + edges materialized per review set). Additive.

CREATE TABLE "CaseGraphNode" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reviewSetId"    TEXT NOT NULL,
    "kind"           TEXT NOT NULL,
    "label"          TEXT NOT NULL,
    "weight"         INTEGER NOT NULL DEFAULT 1,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseGraphNode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CaseGraphNode_reviewSetId_kind_label_key" ON "CaseGraphNode"("reviewSetId", "kind", "label");
CREATE INDEX "CaseGraphNode_organizationId_reviewSetId_idx" ON "CaseGraphNode"("organizationId", "reviewSetId");
ALTER TABLE "CaseGraphNode"
    ADD CONSTRAINT "CaseGraphNode_reviewSetId_fkey"
    FOREIGN KEY ("reviewSetId") REFERENCES "ReviewSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CaseGraphEdge" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reviewSetId"    TEXT NOT NULL,
    "fromLabel"      TEXT NOT NULL,
    "toLabel"        TEXT NOT NULL,
    "kind"           TEXT NOT NULL,
    "weight"         INTEGER NOT NULL DEFAULT 1,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseGraphEdge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CaseGraphEdge_reviewSetId_fromLabel_toLabel_kind_key" ON "CaseGraphEdge"("reviewSetId", "fromLabel", "toLabel", "kind");
CREATE INDEX "CaseGraphEdge_organizationId_reviewSetId_idx" ON "CaseGraphEdge"("organizationId", "reviewSetId");
ALTER TABLE "CaseGraphEdge"
    ADD CONSTRAINT "CaseGraphEdge_reviewSetId_fkey"
    FOREIGN KEY ("reviewSetId") REFERENCES "ReviewSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
