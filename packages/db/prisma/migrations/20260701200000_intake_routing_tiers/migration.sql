-- Intake Phase 1 item 5: tiering layer on Smart Routing. Adds pools
-- (IntakeTeam) + pool membership (IntakeTeamMember) + a route-to-pool
-- action (IntakeRoutingRule.setTeamId). Additive — no existing column
-- changes types, and setTeamId is nullable so existing rules are
-- unaffected.

CREATE TABLE "IntakeTeam" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "strategy" TEXT NOT NULL DEFAULT 'least_loaded',
    "overflowTeamId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntakeTeam_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeTeam_organizationId_key_key" ON "IntakeTeam"("organizationId", "key");
CREATE INDEX "IntakeTeam_organizationId_active_sortOrder_idx" ON "IntakeTeam"("organizationId", "active", "sortOrder");
ALTER TABLE "IntakeTeam" ADD CONSTRAINT "IntakeTeam_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeTeam" ADD CONSTRAINT "IntakeTeam_overflowTeamId_fkey" FOREIGN KEY ("overflowTeamId") REFERENCES "IntakeTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "IntakeTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastAssignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntakeTeamMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeTeamMember_teamId_userId_key" ON "IntakeTeamMember"("teamId", "userId");
CREATE INDEX "IntakeTeamMember_teamId_active_idx" ON "IntakeTeamMember"("teamId", "active");
ALTER TABLE "IntakeTeamMember" ADD CONSTRAINT "IntakeTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "IntakeTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeTeamMember" ADD CONSTRAINT "IntakeTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntakeRoutingRule" ADD COLUMN "setTeamId" TEXT;
ALTER TABLE "IntakeRoutingRule" ADD CONSTRAINT "IntakeRoutingRule_setTeamId_fkey" FOREIGN KEY ("setTeamId") REFERENCES "IntakeTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
