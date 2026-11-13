CREATE TABLE `sync_issues` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`sync_execution_id` bigint unsigned NOT NULL,
	`admin_new_id` bigint unsigned,
	`severity` varchar(10) NOT NULL,
	`code` varchar(50) NOT NULL,
	`message` varchar(500) NOT NULL,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `sync_issues_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_sync_issues_severity` CHECK(`sync_issues`.`severity` IN ('WARNING', 'ERROR'))
);
--> statement-breakpoint
ALTER TABLE `property_source_changes` ADD `processed_by` bigint unsigned;--> statement-breakpoint
ALTER TABLE `sync_executions` ADD `workflows_started` int unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_issues` ADD CONSTRAINT `fk_sync_issues_execution` FOREIGN KEY (`sync_execution_id`) REFERENCES `sync_executions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_sync_issues_execution` ON `sync_issues` (`sync_execution_id`);--> statement-breakpoint
ALTER TABLE `property_source_changes` ADD CONSTRAINT `fk_property_changes_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;