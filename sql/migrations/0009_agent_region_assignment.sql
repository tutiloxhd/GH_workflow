ALTER TABLE `users`
  ADD COLUMN `admin_new_region` varchar(100) NULL;
--> statement-breakpoint
ALTER TABLE `properties`
  ADD COLUMN `assignment_region` varchar(100) NULL,
  ADD COLUMN `auction_mode` varchar(100) NULL;
