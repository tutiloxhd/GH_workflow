ALTER TABLE `task_definitions` DROP CONSTRAINT `chk_task_definitions_due_reference`;--> statement-breakpoint
ALTER TABLE `task_instances` DROP CONSTRAINT `chk_task_instances_status`;--> statement-breakpoint
ALTER TABLE `task_definitions` MODIFY COLUMN `due_reference` varchar(30) NOT NULL DEFAULT 'TASK_ACTIVATED_AT';--> statement-breakpoint
ALTER TABLE `task_definitions` MODIFY COLUMN `due_offset_minutes` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `task_definitions` ADD `due_offset_days` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `task_instances` ADD `status_before_suspension` varchar(20);--> statement-breakpoint
ALTER TABLE `task_instances` ADD `due_reference` varchar(30) DEFAULT 'TASK_ACTIVATED_AT' NOT NULL;--> statement-breakpoint
ALTER TABLE `task_instances` ADD `due_offset_days` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `task_instances` ADD `due_offset_minutes` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `task_definitions` ADD CONSTRAINT `chk_task_definitions_due_reference` CHECK (`task_definitions`.`due_reference` IN ('TASK_ACTIVATED_AT', 'AUCTION_AT', 'GUARANTEE_PAYMENT_AT', 'GUARANTEE_RETURN_AT', 'BALANCE_PAYMENT_AT'));--> statement-breakpoint
ALTER TABLE `task_instances` ADD CONSTRAINT `chk_task_instances_suspension` CHECK ((`task_instances`.`status` = 'SUSPENDED') = (`task_instances`.`status_before_suspension` IS NOT NULL));--> statement-breakpoint
ALTER TABLE `task_instances` ADD CONSTRAINT `chk_task_instances_due_reference` CHECK (`task_instances`.`due_reference` IN ('TASK_ACTIVATED_AT', 'AUCTION_AT', 'GUARANTEE_PAYMENT_AT', 'GUARANTEE_RETURN_AT', 'BALANCE_PAYMENT_AT'));--> statement-breakpoint
ALTER TABLE `task_instances` ADD CONSTRAINT `chk_task_instances_status` CHECK (`task_instances`.`status` IN ('BLOCKED', 'READY', 'IN_PROGRESS', 'SUSPENDED', 'COMPLETED', 'CANCELLED'));