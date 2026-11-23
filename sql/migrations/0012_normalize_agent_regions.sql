CREATE TABLE `regions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	CONSTRAINT `regions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_regions_name` UNIQUE(`name`)
);
--> statement-breakpoint
INSERT INTO `regions` (`name`)
SELECT DISTINCT TRIM(`admin_new_region`)
  FROM `users`
 WHERE `admin_new_region` IS NOT NULL
   AND TRIM(`admin_new_region`) <> ''
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `region_id` bigint unsigned NULL;
--> statement-breakpoint
UPDATE `users` AS `existing_user`
  INNER JOIN `regions` AS `region` ON `region`.`name` = TRIM(`existing_user`.`admin_new_region`)
   SET `existing_user`.`region_id` = `region`.`id`
 WHERE `existing_user`.`admin_new_region` IS NOT NULL
   AND TRIM(`existing_user`.`admin_new_region`) <> '';
--> statement-breakpoint
ALTER TABLE `users`
	ADD KEY `idx_users_region` (`region_id`),
	ADD CONSTRAINT `fk_users_region` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `users`
	DROP COLUMN `admin_new_area_id`,
	DROP COLUMN `admin_new_area_name`,
	DROP COLUMN `admin_new_region`;
