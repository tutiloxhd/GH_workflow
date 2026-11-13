CREATE TABLE `properties` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`admin_new_id` bigint unsigned NOT NULL,
	`title` varchar(255),
	`address` varchar(255),
	`commune` varchar(100),
	`region` varchar(100),
	`court` varchar(150),
	`tribunal` varchar(150),
	`case_reference` varchar(100),
	`auction_at` datetime(6),
	`guarantee_amount` decimal(18,2),
	`guarantee_payment_at` datetime(6),
	`guarantee_window_start` time,
	`guarantee_window_end` time,
	`guarantee_return_at` datetime(6),
	`balance_payment_at` datetime(6),
	`source_updated_at` datetime(6),
	`source_hash` char(64),
	`last_synced_at` datetime(6) NOT NULL,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `properties_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_properties_admin_new_id` UNIQUE(`admin_new_id`),
	CONSTRAINT `chk_properties_guarantee_amount` CHECK(`properties`.`guarantee_amount` IS NULL OR `properties`.`guarantee_amount` >= 0)
);
--> statement-breakpoint
CREATE TABLE `property_source_changes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`property_id` bigint unsigned NOT NULL,
	`change_type` varchar(50) NOT NULL,
	`previous_values` json,
	`current_values` json,
	`status` varchar(20) NOT NULL DEFAULT 'PENDING',
	`error_message` text,
	`detected_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`processed_at` datetime(6),
	CONSTRAINT `property_source_changes_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_property_changes_type` CHECK(`property_source_changes`.`change_type` IN ('PROPERTY_ACCEPTED', 'AUCTION_DATE_CHANGED', 'PROPERTY_DATA_CHANGED', 'NO_LONGER_ACCEPTED')),
	CONSTRAINT `chk_property_changes_status` CHECK(`property_source_changes`.`status` IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED'))
);
--> statement-breakpoint
CREATE TABLE `sync_cursors` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`source_code` varchar(50) NOT NULL,
	`last_source_updated_at` datetime(6),
	`last_source_id` bigint unsigned,
	`last_started_at` datetime(6),
	`last_completed_at` datetime(6),
	`last_status` varchar(20) NOT NULL DEFAULT 'NEVER_RUN',
	`last_error` text,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `sync_cursors_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sync_cursors_source` UNIQUE(`source_code`),
	CONSTRAINT `chk_sync_cursors_status` CHECK(`sync_cursors`.`last_status` IN ('NEVER_RUN', 'RUNNING', 'SUCCEEDED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE `sync_executions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`source_code` varchar(50) NOT NULL,
	`status` varchar(20) NOT NULL,
	`started_at` datetime(6) NOT NULL,
	`completed_at` datetime(6),
	`records_read` int unsigned NOT NULL DEFAULT 0,
	`records_created` int unsigned NOT NULL DEFAULT 0,
	`records_updated` int unsigned NOT NULL DEFAULT 0,
	`warning_count` int unsigned NOT NULL DEFAULT 0,
	`error_count` int unsigned NOT NULL DEFAULT 0,
	`error_message` text,
	CONSTRAINT `sync_executions_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_sync_executions_status` CHECK(`sync_executions`.`status` IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_roles_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` bigint unsigned NOT NULL,
	`role_id` bigint unsigned NOT NULL,
	`assigned_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`assigned_by` bigint unsigned,
	CONSTRAINT `pk_user_roles` PRIMARY KEY(`user_id`,`role_id`)
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` datetime(6) NOT NULL,
	`revoked_at` datetime(6),
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `user_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_user_sessions_token_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`email` varchar(190) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_email` UNIQUE(`email`),
	CONSTRAINT `chk_users_status` CHECK(`users`.`status` IN ('ACTIVE', 'INACTIVE', 'BLOCKED'))
);
--> statement-breakpoint
CREATE TABLE `task_definitions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`workflow_template_id` bigint unsigned NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(150) NOT NULL,
	`description` text,
	`responsible_role` varchar(50) NOT NULL,
	`display_order` int NOT NULL DEFAULT 0,
	`requires_evidence` boolean NOT NULL DEFAULT false,
	`due_reference` varchar(30),
	`due_offset_minutes` int,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `task_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_task_definitions_code` UNIQUE(`workflow_template_id`,`code`),
	CONSTRAINT `chk_task_definitions_role` CHECK(`task_definitions`.`responsible_role` IN ('ADMIN', 'MANAGER', 'BIDDER', 'LEGAL_REVIEWER')),
	CONSTRAINT `chk_task_definitions_due_reference` CHECK(`task_definitions`.`due_reference` IS NULL OR `task_definitions`.`due_reference` IN ('TASK_ACTIVATED_AT', 'AUCTION_AT', 'GUARANTEE_PAYMENT_AT', 'GUARANTEE_RETURN_AT', 'BALANCE_PAYMENT_AT'))
);
--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`task_definition_id` bigint unsigned NOT NULL,
	`depends_on_task_definition_id` bigint unsigned NOT NULL,
	CONSTRAINT `pk_task_dependencies` PRIMARY KEY(`task_definition_id`,`depends_on_task_definition_id`),
	CONSTRAINT `chk_task_dependencies_not_self` CHECK(`task_dependencies`.`task_definition_id` <> `task_dependencies`.`depends_on_task_definition_id`)
);
--> statement-breakpoint
CREATE TABLE `task_evidence_submissions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`task_instance_id` bigint unsigned NOT NULL,
	`submitted_by` bigint unsigned NOT NULL,
	`form_data` json NOT NULL,
	`submitted_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `task_evidence_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_task_evidence_task` UNIQUE(`task_instance_id`)
);
--> statement-breakpoint
CREATE TABLE `task_instances` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`workflow_instance_id` bigint unsigned NOT NULL,
	`task_definition_id` bigint unsigned NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'BLOCKED',
	`assigned_user_id` bigint unsigned,
	`backup_user_id` bigint unsigned,
	`progress_percentage` int unsigned NOT NULL DEFAULT 0,
	`due_at` datetime(6),
	`due_reference_at` datetime(6),
	`activated_at` datetime(6),
	`started_at` datetime(6),
	`completed_at` datetime(6),
	`completed_by` bigint unsigned,
	`lock_version` int unsigned NOT NULL DEFAULT 1,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `task_instances_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_task_instances_definition` UNIQUE(`workflow_instance_id`,`task_definition_id`),
	CONSTRAINT `chk_task_instances_status` CHECK(`task_instances`.`status` IN ('BLOCKED', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT `chk_task_instances_progress` CHECK(`task_instances`.`progress_percentage` <= 100)
);
--> statement-breakpoint
CREATE TABLE `workflow_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`workflow_instance_id` bigint unsigned NOT NULL,
	`task_instance_id` bigint unsigned,
	`actor_user_id` bigint unsigned,
	`event_type` varchar(60) NOT NULL,
	`event_source` varchar(20) NOT NULL,
	`details` json,
	`occurred_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `workflow_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_workflow_events_source` CHECK(`workflow_events`.`event_source` IN ('USER', 'SYSTEM', 'SYNC'))
);
--> statement-breakpoint
CREATE TABLE `workflow_instances` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`property_id` bigint unsigned NOT NULL,
	`workflow_template_id` bigint unsigned NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
	`started_at` datetime(6) NOT NULL,
	`suspended_at` datetime(6),
	`cancelled_at` datetime(6),
	`completed_at` datetime(6),
	`lock_version` int unsigned NOT NULL DEFAULT 1,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `workflow_instances_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_workflow_instances_property` UNIQUE(`property_id`),
	CONSTRAINT `chk_workflow_instances_status` CHECK(`workflow_instances`.`status` IN ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'COMPLETED'))
);
--> statement-breakpoint
CREATE TABLE `workflow_participants` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`workflow_instance_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`participant_type` varchar(50) NOT NULL,
	`assignment_type` varchar(20) NOT NULL,
	`valid_from` datetime(6) NOT NULL,
	`valid_to` datetime(6),
	`assigned_by` bigint unsigned,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `workflow_participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_workflow_participants_type` CHECK(`workflow_participants`.`participant_type` IN ('MANAGER', 'BIDDER', 'LEGAL_REVIEWER')),
	CONSTRAINT `chk_workflow_participants_assignment` CHECK(`workflow_participants`.`assignment_type` IN ('PRIMARY', 'BACKUP')),
	CONSTRAINT `chk_workflow_participants_dates` CHECK(`workflow_participants`.`valid_to` IS NULL OR `workflow_participants`.`valid_to` >= `workflow_participants`.`valid_from`)
);
--> statement-breakpoint
CREATE TABLE `workflow_reprogrammings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`workflow_instance_id` bigint unsigned NOT NULL,
	`source_change_id` bigint unsigned,
	`previous_auction_at` datetime(6),
	`new_auction_at` datetime(6),
	`origin` varchar(20) NOT NULL,
	`reason` text,
	`requested_by` bigint unsigned,
	`status` varchar(20) NOT NULL DEFAULT 'PENDING',
	`error_message` text,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	`applied_at` datetime(6),
	CONSTRAINT `workflow_reprogrammings_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_workflow_reprogrammings_origin` CHECK(`workflow_reprogrammings`.`origin` IN ('SYNC', 'USER')),
	CONSTRAINT `chk_workflow_reprogrammings_status` CHECK(`workflow_reprogrammings`.`status` IN ('PENDING', 'APPLIED', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE `workflow_templates` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`name` varchar(150) NOT NULL,
	`version` int unsigned NOT NULL,
	`is_active` boolean NOT NULL DEFAULT false,
	`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	CONSTRAINT `workflow_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_workflow_templates_code_version` UNIQUE(`code`,`version`)
);
--> statement-breakpoint
ALTER TABLE `property_source_changes` ADD CONSTRAINT `fk_property_changes_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_sessions` ADD CONSTRAINT `fk_user_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_definitions` ADD CONSTRAINT `fk_task_definitions_template` FOREIGN KEY (`workflow_template_id`) REFERENCES `workflow_templates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_dependencies` ADD CONSTRAINT `fk_task_dependencies_task` FOREIGN KEY (`task_definition_id`) REFERENCES `task_definitions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_dependencies` ADD CONSTRAINT `fk_task_dependencies_parent` FOREIGN KEY (`depends_on_task_definition_id`) REFERENCES `task_definitions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_evidence_submissions` ADD CONSTRAINT `fk_task_evidence_task` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_evidence_submissions` ADD CONSTRAINT `fk_task_evidence_submitter` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_instances` ADD CONSTRAINT `fk_task_instances_workflow` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_instances` ADD CONSTRAINT `fk_task_instances_definition` FOREIGN KEY (`task_definition_id`) REFERENCES `task_definitions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_instances` ADD CONSTRAINT `fk_task_instances_assignee` FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_instances` ADD CONSTRAINT `fk_task_instances_backup` FOREIGN KEY (`backup_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_instances` ADD CONSTRAINT `fk_task_instances_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_events` ADD CONSTRAINT `fk_workflow_events_instance` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_events` ADD CONSTRAINT `fk_workflow_events_task` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_events` ADD CONSTRAINT `fk_workflow_events_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_instances` ADD CONSTRAINT `fk_workflow_instances_property` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_instances` ADD CONSTRAINT `fk_workflow_instances_template` FOREIGN KEY (`workflow_template_id`) REFERENCES `workflow_templates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_participants` ADD CONSTRAINT `fk_workflow_participants_instance` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_participants` ADD CONSTRAINT `fk_workflow_participants_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_participants` ADD CONSTRAINT `fk_workflow_participants_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_reprogrammings` ADD CONSTRAINT `fk_workflow_reprogrammings_instance` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_reprogrammings` ADD CONSTRAINT `fk_workflow_reprogrammings_change` FOREIGN KEY (`source_change_id`) REFERENCES `property_source_changes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workflow_reprogrammings` ADD CONSTRAINT `fk_workflow_reprogrammings_requester` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_properties_auction_at` ON `properties` (`auction_at`);--> statement-breakpoint
CREATE INDEX `idx_property_changes_property` ON `property_source_changes` (`property_id`,`detected_at`);--> statement-breakpoint
CREATE INDEX `idx_property_changes_status` ON `property_source_changes` (`status`,`detected_at`);--> statement-breakpoint
CREATE INDEX `idx_sync_executions_source_started` ON `sync_executions` (`source_code`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_user_roles_role` ON `user_roles` (`role_id`);--> statement-breakpoint
CREATE INDEX `idx_user_sessions_user` ON `user_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_task_dependencies_parent` ON `task_dependencies` (`depends_on_task_definition_id`);--> statement-breakpoint
CREATE INDEX `idx_task_instances_assignee` ON `task_instances` (`assigned_user_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_task_instances_backup` ON `task_instances` (`backup_user_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_task_instances_workflow` ON `task_instances` (`workflow_instance_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_workflow_events_instance` ON `workflow_events` (`workflow_instance_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_workflow_events_task` ON `workflow_events` (`task_instance_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_workflow_events_actor` ON `workflow_events` (`actor_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_workflow_instances_status` ON `workflow_instances` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_workflow_participants_current` ON `workflow_participants` (`workflow_instance_id`,`participant_type`,`assignment_type`,`valid_to`);--> statement-breakpoint
CREATE INDEX `idx_workflow_participants_user` ON `workflow_participants` (`user_id`,`valid_to`);--> statement-breakpoint
CREATE INDEX `idx_workflow_reprogrammings_instance` ON `workflow_reprogrammings` (`workflow_instance_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_workflow_reprogrammings_status` ON `workflow_reprogrammings` (`status`,`created_at`);