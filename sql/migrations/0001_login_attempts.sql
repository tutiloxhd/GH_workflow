CREATE TABLE `login_attempts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`email` varchar(190) NOT NULL,
	`succeeded` boolean NOT NULL,
	`attempted_at` datetime(6) NOT NULL,
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_login_attempts_email` ON `login_attempts` (`email`,`attempted_at`);