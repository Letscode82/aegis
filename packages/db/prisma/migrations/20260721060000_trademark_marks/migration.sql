-- CreateTable
CREATE TABLE "TrademarkMark" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "wordMark" TEXT NOT NULL,
    "normalizedMark" TEXT NOT NULL,
    "niceClasses" INTEGER[],
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "ownerName" TEXT,
    "registeredAt" TIMESTAMP(3),
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrademarkMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrademarkMark_normalizedMark_idx" ON "TrademarkMark"("normalizedMark");

-- CreateIndex
CREATE INDEX "TrademarkMark_source_refreshedAt_idx" ON "TrademarkMark"("source", "refreshedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrademarkMark_source_sourceRef_key" ON "TrademarkMark"("source", "sourceRef");

-- CreateIndex

-- CreateIndex

-- RenameIndex

