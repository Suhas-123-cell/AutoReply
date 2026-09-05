-- Fire campaigns on inbound DMs / Story replies, not just post comments.
ALTER TABLE "Automation" ADD COLUMN "dmTriggerEnabled" BOOLEAN NOT NULL DEFAULT false;
