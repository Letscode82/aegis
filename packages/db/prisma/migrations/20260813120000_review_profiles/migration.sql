-- AIR-2: versioned review profiles (instructions) + review-set adoption link. Additive.

-- Adoption link on ReviewSet (criteria/issues seeded from the profile, still editable per-set).
ALTER TABLE "ReviewSet"
    ADD COLUMN "reviewProfileId"      TEXT,
    ADD COLUMN "reviewProfileVersion" INTEGER;

-- ReviewProfile: reusable, versioned review instructions.
CREATE TABLE "ReviewProfile" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "criteria"        TEXT NOT NULL,
    "issuesJson"      JSONB,
    "promptTemplate"  TEXT,
    "modelParamsJson" JSONB,
    "thresholdsJson"  JSONB,
    "version"         INTEGER NOT NULL DEFAULT 1,
    "isArchived"      BOOLEAN NOT NULL DEFAULT false,
    "createdById"     TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReviewProfile_organizationId_isArchived_idx" ON "ReviewProfile"("organizationId", "isArchived");
ALTER TABLE "ReviewProfile"
    ADD CONSTRAINT "ReviewProfile_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ReviewProfileVersion: immutable snapshot per version.
CREATE TABLE "ReviewProfileVersion" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "profileId"       TEXT NOT NULL,
    "version"         INTEGER NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "criteria"        TEXT NOT NULL,
    "issuesJson"      JSONB,
    "promptTemplate"  TEXT,
    "modelParamsJson" JSONB,
    "thresholdsJson"  JSONB,
    "changeLog"       TEXT,
    "createdById"     TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewProfileVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReviewProfileVersion_profileId_version_key" ON "ReviewProfileVersion"("profileId", "version");
CREATE INDEX "ReviewProfileVersion_profileId_createdAt_idx" ON "ReviewProfileVersion"("profileId", "createdAt");
ALTER TABLE "ReviewProfileVersion"
    ADD CONSTRAINT "ReviewProfileVersion_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "ReviewProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
