ALTER TABLE `users`
  ADD COLUMN `rut` varchar(20) NULL,
  ADD COLUMN `admin_new_user_id` int unsigned NULL,
  ADD COLUMN `admin_new_area_id` int unsigned NULL,
  ADD COLUMN `admin_new_area_name` varchar(50) NULL,
  ADD UNIQUE KEY `uq_users_admin_new_user_id` (`admin_new_user_id`);
