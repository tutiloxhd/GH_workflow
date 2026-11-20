ALTER TABLE `notification_rule_sets` ADD `created_by` bigint unsigned;
--> statement-breakpoint
ALTER TABLE `notification_rule_sets` ADD CONSTRAINT `fk_notification_rule_sets_creator`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
