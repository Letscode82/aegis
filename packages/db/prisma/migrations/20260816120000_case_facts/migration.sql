-- INV-3: case chronology facts. Additive.

CREATE TABLE "CaseFact" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "matterId"        TEXT NOT NULL,
    "reviewSetItemId" TEXT,
    "occurredOn"      TIMESTAMP(3),
    "label"           TEXT NOT NULL,
    "detail"          TEXT,
    "issueKeys"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sourceQuote"     TEXT,
    "createdById"     TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CaseFact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CaseFact_organizationId_matterId_occurredOn_idx" ON "CaseFact"("organizationId", "matterId", "occurredOn");
ALTER TABLE "CaseFact"
    ADD CONSTRAINT "CaseFact_matterId_fkey"
    FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseFact"
    ADD CONSTRAINT "CaseFact_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
