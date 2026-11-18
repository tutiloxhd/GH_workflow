CREATE TABLE `notification_jobs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`task_instance_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`event_type` varchar(40) NOT NULL,
	`occurrence_key` varchar(190) NOT NULL,
	`scheduled_at` datetime(6) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'PENDING',
	`locked_by` varchar(100),
	`locked_until` datetime(6),
	`attempts` int unsigned NOT NULL DEFAULT 0,
	`last_error` varchar(500),
	`completed_at` datetime(6),
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `notification_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_notification_jobs_occurrence` UNIQUE(`occurrence_key`),
	CONSTRAINT `chk_notification_jobs_status` CHECK(`notification_jobs`.`status` IN ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`workflow_event_id` bigint unsigned NOT NULL,
	`event_type` varchar(60) NOT NULL,
	`workflow_instance_id` bigint unsigned NOT NULL,
	`task_instance_id` bigint unsigned,
	`payload` json,
	`available_at` datetime(6) NOT NULL,
	`processed_at` datetime(6),
	`locked_by` varchar(100),
	`locked_until` datetime(6),
	`attempts` int unsigned NOT NULL DEFAULT 0,
	`last_error` varchar(500),
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `notification_outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_notification_outbox_event` UNIQUE(`workflow_event_id`)
);
--> statement-breakpoint
CREATE TABLE `notification_rule_sets` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`workflow_template_id` bigint unsigned NOT NULL,
	`version` int unsigned NOT NULL,
	`is_published` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `notification_rule_sets_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_notification_rule_sets_template_version` UNIQUE(`workflow_template_id`,`version`),
	CONSTRAINT `chk_notification_rule_sets_published` CHECK(`notification_rule_sets`.`is_published` IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `notification_rules` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`rule_set_id` bigint unsigned NOT NULL,
	`event_type` varchar(40) NOT NULL,
	`offset_minutes` int NOT NULL DEFAULT 0,
	`is_enabled` int unsigned NOT NULL DEFAULT 1,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `notification_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_notification_rules_set_trigger` UNIQUE(`rule_set_id`,`event_type`),
	CONSTRAINT `chk_notification_rules_trigger` CHECK(`notification_rules`.`event_type` IN ('TASK_ASSIGNED', 'TASK_REMINDER', 'TASK_ESCALATION', 'TASK_OVERDUE', 'TASK_COMPLETED')),
	CONSTRAINT `chk_notification_rules_enabled` CHECK(`notification_rules`.`is_enabled` IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`event_type` varchar(40) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`workflow_instance_id` bigint unsigned NOT NULL,
	`task_instance_id` bigint unsigned,
	`deduplication_key` varchar(190) NOT NULL,
	`read_at` datetime(6),
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_notifications_deduplication` UNIQUE(`deduplication_key`)
);
--> statement-breakpoint
CREATE TABLE `workflow_notification_rule_sets` (
	`workflow_instance_id` bigint unsigned NOT NULL,
	`rule_set_id` bigint unsigned NOT NULL,
	`assigned_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `workflow_notification_rule_sets_workflow_instance_id` PRIMARY KEY(`workflow_instance_id`)
);
--> statement-breakpoint
ALTER TABLE `notification_jobs` ADD CONSTRAINT `fk_notification_jobs_task` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_jobs` ADD CONSTRAINT `fk_notification_jobs_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_outbox` ADD CONSTRAINT `fk_notification_outbox_event` FOREIGN KEY (`workflow_event_id`) REFERENCES `workflow_events`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_outbox` ADD CONSTRAINT `fk_notification_outbox_workflow` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_outbox` ADD CONSTRAINT `fk_notification_outbox_task` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_rule_sets` ADD CONSTRAINT `fk_notification_rule_sets_template` FOREIGN KEY (`workflow_template_id`) REFERENCES `workflow_templates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_rules` ADD CONSTRAINT `fk_notification_rules_set` FOREIGN KEY (`rule_set_id`) REFERENCES `notification_rule_sets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `fk_notifications_workflow` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `fk_notifications_task` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_notification_rule_sets` ADD CONSTRAINT `fk_workflow_notification_rules_workflow` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_notification_rule_sets` ADD CONSTRAINT `fk_workflow_notification_rules_set` FOREIGN KEY (`rule_set_id`) REFERENCES `notification_rule_sets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_notification_jobs_due` ON `notification_jobs` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `idx_notification_jobs_task` ON `notification_jobs` (`task_instance_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_notification_outbox_pending` ON `notification_outbox` (`processed_at`,`available_at`);--> statement-breakpoint
CREATE INDEX `idx_notification_outbox_lease` ON `notification_outbox` (`locked_until`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user` ON `notifications` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_task` ON `notifications` (`task_instance_id`);
--> statement-breakpoint
INSERT INTO notification_rule_sets (workflow_template_id, version, is_published)
SELECT id, 1, 1 FROM workflow_templates;
--> statement-breakpoint
INSERT INTO notification_rules (rule_set_id, event_type, offset_minutes, is_enabled)
SELECT id, 'TASK_ASSIGNED', 0, 1 FROM notification_rule_sets
UNION ALL SELECT id, 'TASK_REMINDER', 2880, 1 FROM notification_rule_sets
UNION ALL SELECT id, 'TASK_ESCALATION', 1440, 1 FROM notification_rule_sets
UNION ALL SELECT id, 'TASK_OVERDUE', 0, 1 FROM notification_rule_sets
UNION ALL SELECT id, 'TASK_COMPLETED', 0, 1 FROM notification_rule_sets;
--> statement-breakpoint
INSERT INTO workflow_notification_rule_sets (workflow_instance_id, rule_set_id)
SELECT wi.id, nrs.id
  FROM workflow_instances wi
  JOIN notification_rule_sets nrs ON nrs.workflow_template_id = wi.workflow_template_id
 WHERE nrs.is_published = 1;
