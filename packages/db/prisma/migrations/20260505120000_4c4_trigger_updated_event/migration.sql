-- Sub-PR 4c.4: add TRIGGER_UPDATED to the LegalHoldEventType enum.
-- Distinguishes a follow-up trigger-event edit from the initial
-- TRIGGER_RECORDED row so the audit reader can spot post-hoc
-- changes to the hold's "when did duty attach" anchor.

ALTER TYPE "LegalHoldEventType" ADD VALUE 'TRIGGER_UPDATED';
