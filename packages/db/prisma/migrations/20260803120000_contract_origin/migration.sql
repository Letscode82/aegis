-- Contract origin — OUR_PAPER (templated) vs THIRD_PARTY (inbound paper under
-- review). Drives the 3rd-party review + signing workflow. Additive.
CREATE TYPE "ContractOrigin" AS ENUM ('OUR_PAPER', 'THIRD_PARTY');
ALTER TABLE "Contract" ADD COLUMN "origin" "ContractOrigin" NOT NULL DEFAULT 'OUR_PAPER';
