ALTER TABLE `workflow_templates` ADD `deadline_day_kind` varchar(20) DEFAULT 'CALENDAR' NOT NULL;
--> statement-breakpoint
ALTER TABLE `workflow_templates` ADD CONSTRAINT `chk_workflow_templates_day_kind`
  CHECK (`workflow_templates`.`deadline_day_kind` IN ('CALENDAR', 'BUSINESS'));
--> statement-breakpoint
CREATE TABLE `holidays` (
  `id` bigint unsigned AUTO_INCREMENT NOT NULL,
  `holiday_date` date NOT NULL,
  `name` varchar(200) NOT NULL,
  `is_inalienable` boolean NOT NULL DEFAULT false,
  `source` varchar(20) NOT NULL,
  `created_by` bigint unsigned,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `holidays_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_holidays_date` UNIQUE(`holiday_date`),
  CONSTRAINT `chk_holidays_source` CHECK(`holidays`.`source` IN ('BOOSTR', 'MANUAL'))
);
--> statement-breakpoint
ALTER TABLE `holidays` ADD CONSTRAINT `fk_holidays_creator`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
