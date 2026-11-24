ALTER TABLE `workflow_templates` ADD `status` varchar(20) DEFAULT 'PUBLISHED' NOT NULL;
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD `created_by` bigint unsigned;
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD `published_by` bigint unsigned;
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD `published_at` datetime(6);
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD `archived_by` bigint unsigned;
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD `archived_at` datetime(6);
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) NOT NULL;
--> statement-breakpoint
UPDATE `workflow_templates` SET `published_at` = `created_at` WHERE `published_at` IS NULL;
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD CONSTRAINT `fk_workflow_templates_creator`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD CONSTRAINT `fk_workflow_templates_publisher`
  FOREIGN KEY (`published_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD CONSTRAINT `fk_workflow_templates_archiver`
  FOREIGN KEY (`archived_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD CONSTRAINT `chk_workflow_templates_status`
  CHECK (`workflow_templates`.`status` IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD CONSTRAINT `chk_workflow_templates_active_published`
  CHECK (`workflow_templates`.`is_active` = FALSE OR `workflow_templates`.`status` = 'PUBLISHED');
