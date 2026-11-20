ALTER TABLE `workflow_events` ADD `occurrence_key` varchar(190);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_workflow_events_occurrence` ON `workflow_events` (`occurrence_key`);
