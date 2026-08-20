-- INV-1: internal investigations (1:1 companion to an INVESTIGATION-type Matter). Additive.

CREATE TABLE "Investigation" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "matterId"       TEXT NOT NULL,
    "sourceText"     TEXT NOT NULL,
    "issuesJson"     JSONB,
    "planJson"       JSONB,
    "status"         TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Investigation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Investigation_matterId_key" ON "Investigation"("matterId");
CREATE INDEX "Investigation_organizationId_status_idx" ON "Investigation"("organizationId", "status");
ALTER TABLE "Investigation"
    ADD CONSTRAINT "Investigation_matterId_fkey"
    FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Investigation"
    ADD CONSTRAINT "Investigation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
