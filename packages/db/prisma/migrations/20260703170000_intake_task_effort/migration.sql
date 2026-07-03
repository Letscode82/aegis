-- W3-5: minutes-per-task effort capture. Additive, defaulted.
ALTER TABLE "IntakeTicketTask" ADD COLUMN "effortMinutes" INTEGER NOT NULL DEFAULT 0;
