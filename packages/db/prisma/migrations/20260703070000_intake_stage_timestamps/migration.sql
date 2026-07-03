-- W1-5: per-stage advancement timestamps (feeds per-stage TAT and the
-- W2-4 multi-leg SLA legs). Additive, nullable.
ALTER TABLE "IntakeTicket" ADD COLUMN "stageTimestampsJson" JSONB;
