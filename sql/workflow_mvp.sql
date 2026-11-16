-- Base de datos del MVP Â«Workflow de RematesÂ» (fase 1, hasta el sprint 4)
-- Generado el 2026-11-16 desde la base de desarrollo con mysqldump (MySQL 8).
--
-- Contiene: la estructura de las 19 tablas del MVP, la tabla __drizzle_migrations
-- (migraciones 0000 a 0004 ya registradas) y los datos de referencia: roles,
-- plantillas de workflow v1 y v2 (v2 activa), tareas y dependencias, y los usuarios
-- de desarrollo con sus roles (contraseÃ±as en LEVANTAR-PROYECTO.md).
-- No contiene: sesiones, propiedades, workflows ni datos de admin_new; las propiedades
-- llegan con el sincronizador desde la base admin_new de pruebas de cada dev.
--
-- SOLO DESARROLLO: las contraseÃ±as de estos usuarios estÃ¡n documentadas en el repositorio.
-- Nunca cargar este archivo en QA ni producciÃ³n.
--
-- La fuente de verdad sigue siendo el esquema Drizzle y sql/migrations; este archivo
-- es una foto para levantar una base nueva rÃ¡pido. Borra y recrea las tablas:
-- cÃ¡rgalo solo en una base vacÃ­a o desechable.
--
-- Uso:
--   CREATE DATABASE workflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   mysql -u <usuario> -p workflow < sql/workflow_mvp.sql
-- GuÃ­a completa: LEVANTAR-PROYECTO.md en la raÃ­z del repositorio.

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `__drizzle_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `__drizzle_migrations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `hash` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `login_attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_attempts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(190) COLLATE utf8mb4_unicode_ci NOT NULL,
  `succeeded` tinyint(1) NOT NULL,
  `attempted_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_login_attempts_email` (`email`,`attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `properties`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `properties` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `admin_new_id` bigint unsigned NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `commune` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `court` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tribunal` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `case_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `auction_at` datetime(6) DEFAULT NULL,
  `guarantee_amount` decimal(18,2) DEFAULT NULL,
  `guarantee_payment_at` datetime(6) DEFAULT NULL,
  `guarantee_window_start` time DEFAULT NULL,
  `guarantee_window_end` time DEFAULT NULL,
  `guarantee_return_at` datetime(6) DEFAULT NULL,
  `balance_payment_at` datetime(6) DEFAULT NULL,
  `source_updated_at` datetime(6) DEFAULT NULL,
  `source_hash` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_synced_at` datetime(6) NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_properties_admin_new_id` (`admin_new_id`),
  KEY `idx_properties_auction_at` (`auction_at`),
  CONSTRAINT `chk_properties_guarantee_amount` CHECK (((`guarantee_amount` is null) or (`guarantee_amount` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `property_source_changes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `property_source_changes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `property_id` bigint unsigned NOT NULL,
  `change_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_values` json DEFAULT NULL,
  `current_values` json DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `detected_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `processed_at` datetime(6) DEFAULT NULL,
  `processed_by` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_property_changes_property` (`property_id`,`detected_at`),
  KEY `idx_property_changes_status` (`status`,`detected_at`),
  KEY `fk_property_changes_processed_by` (`processed_by`),
  CONSTRAINT `fk_property_changes_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_property_changes_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`),
  CONSTRAINT `chk_property_changes_status` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'PROCESSING',_utf8mb4'PROCESSED',_utf8mb4'FAILED',_utf8mb4'IGNORED'))),
  CONSTRAINT `chk_property_changes_type` CHECK ((`change_type` in (_utf8mb4'PROPERTY_ACCEPTED',_utf8mb4'AUCTION_DATE_CHANGED',_utf8mb4'PROPERTY_DATA_CHANGED',_utf8mb4'NO_LONGER_ACCEPTED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sync_cursors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sync_cursors` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `source_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_source_updated_at` datetime(6) DEFAULT NULL,
  `last_source_id` bigint unsigned DEFAULT NULL,
  `last_started_at` datetime(6) DEFAULT NULL,
  `last_completed_at` datetime(6) DEFAULT NULL,
  `last_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NEVER_RUN',
  `last_error` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sync_cursors_source` (`source_code`),
  CONSTRAINT `chk_sync_cursors_status` CHECK ((`last_status` in (_utf8mb4'NEVER_RUN',_utf8mb4'RUNNING',_utf8mb4'SUCCEEDED',_utf8mb4'FAILED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sync_executions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sync_executions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `source_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime(6) NOT NULL,
  `completed_at` datetime(6) DEFAULT NULL,
  `records_read` int unsigned NOT NULL DEFAULT '0',
  `records_created` int unsigned NOT NULL DEFAULT '0',
  `records_updated` int unsigned NOT NULL DEFAULT '0',
  `warning_count` int unsigned NOT NULL DEFAULT '0',
  `error_count` int unsigned NOT NULL DEFAULT '0',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `workflows_started` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_sync_executions_source_started` (`source_code`,`started_at`),
  CONSTRAINT `chk_sync_executions_status` CHECK ((`status` in (_utf8mb4'RUNNING',_utf8mb4'SUCCEEDED',_utf8mb4'PARTIAL',_utf8mb4'FAILED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sync_issues`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sync_issues` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sync_execution_id` bigint unsigned NOT NULL,
  `admin_new_id` bigint unsigned DEFAULT NULL,
  `severity` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_sync_issues_execution` (`sync_execution_id`),
  CONSTRAINT `fk_sync_issues_execution` FOREIGN KEY (`sync_execution_id`) REFERENCES `sync_executions` (`id`),
  CONSTRAINT `chk_sync_issues_severity` CHECK ((`severity` in (_utf8mb4'WARNING',_utf8mb4'ERROR')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `task_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_definitions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_template_id` bigint unsigned NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `responsible_role` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_order` int NOT NULL DEFAULT '0',
  `requires_evidence` tinyint(1) NOT NULL DEFAULT '0',
  `due_reference` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TASK_ACTIVATED_AT',
  `due_offset_minutes` int NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `due_offset_days` int NOT NULL DEFAULT '3',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_task_definitions_code` (`workflow_template_id`,`code`),
  CONSTRAINT `fk_task_definitions_template` FOREIGN KEY (`workflow_template_id`) REFERENCES `workflow_templates` (`id`),
  CONSTRAINT `chk_task_definitions_due_reference` CHECK ((`due_reference` in (_utf8mb4'TASK_ACTIVATED_AT',_utf8mb4'AUCTION_AT',_utf8mb4'GUARANTEE_PAYMENT_AT',_utf8mb4'GUARANTEE_RETURN_AT',_utf8mb4'BALANCE_PAYMENT_AT'))),
  CONSTRAINT `chk_task_definitions_role` CHECK ((`responsible_role` in (_utf8mb4'ADMIN',_utf8mb4'MANAGER',_utf8mb4'BIDDER',_utf8mb4'LEGAL_REVIEWER')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `task_dependencies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_dependencies` (
  `task_definition_id` bigint unsigned NOT NULL,
  `depends_on_task_definition_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`task_definition_id`,`depends_on_task_definition_id`),
  KEY `idx_task_dependencies_parent` (`depends_on_task_definition_id`),
  CONSTRAINT `fk_task_dependencies_parent` FOREIGN KEY (`depends_on_task_definition_id`) REFERENCES `task_definitions` (`id`),
  CONSTRAINT `fk_task_dependencies_task` FOREIGN KEY (`task_definition_id`) REFERENCES `task_definitions` (`id`),
  CONSTRAINT `chk_task_dependencies_not_self` CHECK ((`task_definition_id` <> `depends_on_task_definition_id`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `task_evidence_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_evidence_submissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `task_instance_id` bigint unsigned NOT NULL,
  `submitted_by` bigint unsigned NOT NULL,
  `form_data` json NOT NULL,
  `submitted_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_task_evidence_task` (`task_instance_id`),
  KEY `fk_task_evidence_submitter` (`submitted_by`),
  CONSTRAINT `fk_task_evidence_submitter` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_task_evidence_task` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `task_instances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_instances` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_instance_id` bigint unsigned NOT NULL,
  `task_definition_id` bigint unsigned NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'BLOCKED',
  `assigned_user_id` bigint unsigned DEFAULT NULL,
  `backup_user_id` bigint unsigned DEFAULT NULL,
  `due_at` datetime(6) DEFAULT NULL,
  `due_reference_at` datetime(6) DEFAULT NULL,
  `activated_at` datetime(6) DEFAULT NULL,
  `started_at` datetime(6) DEFAULT NULL,
  `completed_at` datetime(6) DEFAULT NULL,
  `completed_by` bigint unsigned DEFAULT NULL,
  `lock_version` int unsigned NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `status_before_suspension` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `due_reference` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TASK_ACTIVATED_AT',
  `due_offset_days` int NOT NULL DEFAULT '3',
  `due_offset_minutes` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_task_instances_definition` (`workflow_instance_id`,`task_definition_id`),
  KEY `fk_task_instances_definition` (`task_definition_id`),
  KEY `fk_task_instances_completed_by` (`completed_by`),
  KEY `idx_task_instances_assignee` (`assigned_user_id`,`status`,`due_at`),
  KEY `idx_task_instances_backup` (`backup_user_id`,`status`,`due_at`),
  KEY `idx_task_instances_workflow` (`workflow_instance_id`,`status`),
  CONSTRAINT `fk_task_instances_assignee` FOREIGN KEY (`assigned_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_task_instances_backup` FOREIGN KEY (`backup_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_task_instances_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_task_instances_definition` FOREIGN KEY (`task_definition_id`) REFERENCES `task_definitions` (`id`),
  CONSTRAINT `fk_task_instances_workflow` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances` (`id`),
  CONSTRAINT `chk_task_instances_due_reference` CHECK ((`due_reference` in (_utf8mb4'TASK_ACTIVATED_AT',_utf8mb4'AUCTION_AT',_utf8mb4'GUARANTEE_PAYMENT_AT',_utf8mb4'GUARANTEE_RETURN_AT',_utf8mb4'BALANCE_PAYMENT_AT'))),
  CONSTRAINT `chk_task_instances_status` CHECK ((`status` in (_utf8mb4'BLOCKED',_utf8mb4'READY',_utf8mb4'IN_PROGRESS',_utf8mb4'SUSPENDED',_utf8mb4'COMPLETED',_utf8mb4'CANCELLED'))),
  CONSTRAINT `chk_task_instances_suspension` CHECK (((`status` = _utf8mb4'SUSPENDED') = (`status_before_suspension` is not null)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_roles` (
  `user_id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `assigned_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `assigned_by` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `fk_user_roles_assigned_by` (`assigned_by`),
  KEY `idx_user_roles_role` (`role_id`),
  CONSTRAINT `fk_user_roles_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`),
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  `revoked_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_sessions_token_hash` (`token_hash`),
  KEY `idx_user_sessions_user` (`user_id`,`expires_at`),
  CONSTRAINT `fk_user_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(190) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  CONSTRAINT `chk_users_status` CHECK ((`status` in (_utf8mb4'ACTIVE',_utf8mb4'INACTIVE',_utf8mb4'BLOCKED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_instance_id` bigint unsigned NOT NULL,
  `task_instance_id` bigint unsigned DEFAULT NULL,
  `actor_user_id` bigint unsigned DEFAULT NULL,
  `event_type` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `details` json DEFAULT NULL,
  `occurred_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_workflow_events_instance` (`workflow_instance_id`,`occurred_at`),
  KEY `idx_workflow_events_task` (`task_instance_id`,`occurred_at`),
  KEY `idx_workflow_events_actor` (`actor_user_id`,`occurred_at`),
  CONSTRAINT `fk_workflow_events_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_workflow_events_instance` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances` (`id`),
  CONSTRAINT `fk_workflow_events_task` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances` (`id`),
  CONSTRAINT `chk_workflow_events_source` CHECK ((`event_source` in (_utf8mb4'USER',_utf8mb4'SYSTEM',_utf8mb4'SYNC')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_instances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_instances` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `property_id` bigint unsigned NOT NULL,
  `workflow_template_id` bigint unsigned NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `started_at` datetime(6) NOT NULL,
  `suspended_at` datetime(6) DEFAULT NULL,
  `cancelled_at` datetime(6) DEFAULT NULL,
  `completed_at` datetime(6) DEFAULT NULL,
  `lock_version` int unsigned NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_workflow_instances_property` (`property_id`),
  KEY `fk_workflow_instances_template` (`workflow_template_id`),
  KEY `idx_workflow_instances_status` (`status`,`started_at`),
  CONSTRAINT `fk_workflow_instances_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`),
  CONSTRAINT `fk_workflow_instances_template` FOREIGN KEY (`workflow_template_id`) REFERENCES `workflow_templates` (`id`),
  CONSTRAINT `chk_workflow_instances_status` CHECK ((`status` in (_utf8mb4'ACTIVE',_utf8mb4'SUSPENDED',_utf8mb4'CANCELLED',_utf8mb4'COMPLETED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_participants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_instance_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `participant_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assignment_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valid_from` datetime(6) NOT NULL,
  `valid_to` datetime(6) DEFAULT NULL,
  `assigned_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `fk_workflow_participants_assigner` (`assigned_by`),
  KEY `idx_workflow_participants_current` (`workflow_instance_id`,`participant_type`,`assignment_type`,`valid_to`),
  KEY `idx_workflow_participants_user` (`user_id`,`valid_to`),
  CONSTRAINT `fk_workflow_participants_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_workflow_participants_instance` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances` (`id`),
  CONSTRAINT `fk_workflow_participants_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_workflow_participants_assignment` CHECK ((`assignment_type` in (_utf8mb4'PRIMARY',_utf8mb4'BACKUP'))),
  CONSTRAINT `chk_workflow_participants_dates` CHECK (((`valid_to` is null) or (`valid_to` >= `valid_from`))),
  CONSTRAINT `chk_workflow_participants_type` CHECK ((`participant_type` in (_utf8mb4'MANAGER',_utf8mb4'BIDDER',_utf8mb4'LEGAL_REVIEWER')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_reprogrammings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_reprogrammings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `workflow_instance_id` bigint unsigned NOT NULL,
  `source_change_id` bigint unsigned DEFAULT NULL,
  `previous_auction_at` datetime(6) DEFAULT NULL,
  `new_auction_at` datetime(6) DEFAULT NULL,
  `origin` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `requested_by` bigint unsigned DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `applied_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_workflow_reprogrammings_change` (`source_change_id`),
  KEY `fk_workflow_reprogrammings_requester` (`requested_by`),
  KEY `idx_workflow_reprogrammings_instance` (`workflow_instance_id`,`created_at`),
  KEY `idx_workflow_reprogrammings_status` (`status`,`created_at`),
  CONSTRAINT `fk_workflow_reprogrammings_change` FOREIGN KEY (`source_change_id`) REFERENCES `property_source_changes` (`id`),
  CONSTRAINT `fk_workflow_reprogrammings_instance` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances` (`id`),
  CONSTRAINT `fk_workflow_reprogrammings_requester` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_workflow_reprogrammings_origin` CHECK ((`origin` in (_utf8mb4'SYNC',_utf8mb4'USER'))),
  CONSTRAINT `chk_workflow_reprogrammings_status` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'APPLIED',_utf8mb4'FAILED',_utf8mb4'CANCELLED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_templates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` int unsigned NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_workflow_templates_code_version` (`code`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;



/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

LOCK TABLES `__drizzle_migrations` WRITE;
/*!40000 ALTER TABLE `__drizzle_migrations` DISABLE KEYS */;
INSERT INTO `__drizzle_migrations` VALUES (1,'b485a11d836e879cd458584952ebdf55a40374b77ac6886a00209eecba16a283',1794506362367);
INSERT INTO `__drizzle_migrations` VALUES (2,'2c24fb9c8c7fd4fa92d5ee2fc1b5bbc91e9b8078fac5d64bbf81a51998849305',1794510447031);
INSERT INTO `__drizzle_migrations` VALUES (3,'d261efb18a7ef075952efc5f006f2f6e1641a75afbb6553d9254e5e623558b77',1794513844081);
INSERT INTO `__drizzle_migrations` VALUES (4,'70faa4d8aa2f81c5f6bb1864bffd8ddbd89eef4f56ba0e4134f8002959c2bec7',1794575961615);
INSERT INTO `__drizzle_migrations` VALUES (5,'bae83910ce6f7e1183551252632bfa7fcd0e35c10e0881f348ea25ae8e7642ce',1794585673575);
/*!40000 ALTER TABLE `__drizzle_migrations` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'ADMIN','Administrador','2026-11-12 15:01:14.325016');
INSERT INTO `roles` VALUES (2,'MANAGER','Gestor de remates','2026-11-12 15:01:14.325016');
INSERT INTO `roles` VALUES (3,'BIDDER','Responsable de participación','2026-11-12 15:01:14.325016');
INSERT INTO `roles` VALUES (4,'LEGAL_REVIEWER','Responsable de revisión legal','2026-11-12 15:01:14.325016');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `workflow_templates` WRITE;
/*!40000 ALTER TABLE `workflow_templates` DISABLE KEYS */;
INSERT INTO `workflow_templates` VALUES (1,'REMATE_JUDICIAL','Remate judicial',1,0,'2026-11-12 17:04:51.553573');
INSERT INTO `workflow_templates` VALUES (3,'REMATE_JUDICIAL','Remate judicial',2,1,'2026-11-13 10:19:49.169262');
/*!40000 ALTER TABLE `workflow_templates` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `task_definitions` WRITE;
/*!40000 ALTER TABLE `task_definitions` DISABLE KEYS */;
INSERT INTO `task_definitions` VALUES (1,1,'ASSIGN_MANAGER_AND_BIDDER','Asignar gestor y postor','Definir quién gestiona el remate y quién participa como postor.','ADMIN',2,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (2,1,'GENERATE_VALE_VISTA_LETTER','Generar carta Vale Vista','Generar la carta para solicitar el Vale Vista.','ADMIN',3,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (3,1,'SEND_LETTER_TO_GENERAL_MANAGER','Enviar carta al gerente general','Enviar la carta por email, con el adjunto, al gerente general.','ADMIN',4,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (4,1,'SEND_LETTER_TO_BANK','Enviar carta al banco','El gerente general envía la carta al banco desde su buzón.','ADMIN',5,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (5,1,'PREPARE_SUBMISSION_FORM','Generar formulario','Generar el formulario que se entrega junto al Vale Vista.','MANAGER',6,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (6,1,'PRE_DELIVERY_LEGAL_REVIEW','Revisión legal pre-entrega','Revisión legal previa a la entrega. Legal puede suspender o cancelar el remate.','LEGAL_REVIEWER',7,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (7,1,'COLLECT_VALE_VISTA','Retirar Vale Vista','Retirar el Vale Vista en el banco.','MANAGER',8,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (8,1,'DELIVER_VALE_VISTA_AND_FORM','Entregar Vale Vista + formulario','Entregar el Vale Vista y el formulario en el juzgado.','MANAGER',9,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (9,1,'RECORD_DELIVERY_EVIDENCE','Registrar evidencia','Registrar las fotos timbradas como evidencia de la entrega.','MANAGER',10,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (10,1,'FINAL_LEGAL_REVIEW','Revisión legal final','Revisión legal final antes del remate. Legal puede suspender o cancelar el remate.','LEGAL_REVIEWER',11,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (11,1,'PREPARE_PARTICIPATION','Preparar participación','Dejar listos el link de la sala y el monto para participar.','BIDDER',12,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (12,1,'PRE_AUCTION_ALERTS','Alertas pre-remate','Avisar a los participantes antes del remate.','ADMIN',13,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (13,1,'ENTER_VIRTUAL_ROOM','Ingresar a sala virtual','Ingresar a la sala virtual, como máximo 15 minutos antes.','BIDDER',14,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (14,1,'PARTICIPATE_IN_AUCTION','Participar en remate','Participar en el remate.','BIDDER',15,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (15,1,'RECORD_AUCTION_RESULT','Registrar resultado','Registrar el resultado del remate.','BIDDER',16,0,'TASK_ACTIVATED_AT',0,'2026-11-12 17:04:51.559517',3);
INSERT INTO `task_definitions` VALUES (17,3,'ASSIGN_MANAGER_AND_BIDDER','Asignar gestor y postor','Definir quién gestiona el remate y quién participa como postor.','ADMIN',2,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (18,3,'GENERATE_VALE_VISTA_LETTER','Generar carta Vale Vista','Generar la carta para solicitar el Vale Vista.','ADMIN',3,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (19,3,'SEND_LETTER_TO_GENERAL_MANAGER','Enviar carta al gerente general','Enviar la carta por email, con el adjunto, al gerente general.','ADMIN',4,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (20,3,'SEND_LETTER_TO_BANK','Enviar carta al banco','El gerente general envía la carta al banco desde su buzón.','ADMIN',5,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (21,3,'PREPARE_SUBMISSION_FORM','Generar formulario','Generar el formulario que se entrega junto al Vale Vista.','MANAGER',6,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (22,3,'PRE_DELIVERY_LEGAL_REVIEW','Revisión legal pre-entrega','Revisión legal previa a la entrega. Legal puede suspender o cancelar el remate.','LEGAL_REVIEWER',7,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (23,3,'COLLECT_VALE_VISTA','Retirar Vale Vista','Retirar el Vale Vista en el banco.','MANAGER',8,1,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (24,3,'DELIVER_VALE_VISTA_AND_FORM','Entregar Vale Vista + formulario','Entregar el Vale Vista y el formulario en el juzgado.','MANAGER',9,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (25,3,'RECORD_DELIVERY_EVIDENCE','Registrar evidencia','Registrar las fotos timbradas como evidencia de la entrega.','MANAGER',10,1,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (26,3,'FINAL_LEGAL_REVIEW','Revisión legal final','Revisión legal final antes del remate. Legal puede suspender o cancelar el remate.','LEGAL_REVIEWER',11,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (27,3,'PREPARE_PARTICIPATION','Preparar participación','Dejar listos el link de la sala y el monto para participar.','BIDDER',12,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (28,3,'PRE_AUCTION_ALERTS','Alertas pre-remate','Avisar a los participantes antes del remate.','ADMIN',13,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (29,3,'ENTER_VIRTUAL_ROOM','Ingresar a sala virtual','Ingresar a la sala virtual, como máximo 15 minutos antes.','BIDDER',14,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (30,3,'PARTICIPATE_IN_AUCTION','Participar en remate','Participar en el remate.','BIDDER',15,0,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
INSERT INTO `task_definitions` VALUES (31,3,'RECORD_AUCTION_RESULT','Registrar resultado','Registrar el resultado del remate.','BIDDER',16,1,'TASK_ACTIVATED_AT',0,'2026-11-13 10:19:49.177874',3);
/*!40000 ALTER TABLE `task_definitions` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `task_dependencies` WRITE;
/*!40000 ALTER TABLE `task_dependencies` DISABLE KEYS */;
INSERT INTO `task_dependencies` VALUES (2,1);
INSERT INTO `task_dependencies` VALUES (3,2);
INSERT INTO `task_dependencies` VALUES (4,3);
INSERT INTO `task_dependencies` VALUES (5,1);
INSERT INTO `task_dependencies` VALUES (6,1);
INSERT INTO `task_dependencies` VALUES (7,4);
INSERT INTO `task_dependencies` VALUES (8,5);
INSERT INTO `task_dependencies` VALUES (8,7);
INSERT INTO `task_dependencies` VALUES (9,8);
INSERT INTO `task_dependencies` VALUES (10,9);
INSERT INTO `task_dependencies` VALUES (11,9);
INSERT INTO `task_dependencies` VALUES (12,11);
INSERT INTO `task_dependencies` VALUES (13,11);
INSERT INTO `task_dependencies` VALUES (14,13);
INSERT INTO `task_dependencies` VALUES (15,14);
INSERT INTO `task_dependencies` VALUES (18,17);
INSERT INTO `task_dependencies` VALUES (19,18);
INSERT INTO `task_dependencies` VALUES (20,19);
INSERT INTO `task_dependencies` VALUES (21,17);
INSERT INTO `task_dependencies` VALUES (22,17);
INSERT INTO `task_dependencies` VALUES (23,20);
INSERT INTO `task_dependencies` VALUES (24,21);
INSERT INTO `task_dependencies` VALUES (24,23);
INSERT INTO `task_dependencies` VALUES (25,24);
INSERT INTO `task_dependencies` VALUES (26,25);
INSERT INTO `task_dependencies` VALUES (27,25);
INSERT INTO `task_dependencies` VALUES (28,27);
INSERT INTO `task_dependencies` VALUES (29,27);
INSERT INTO `task_dependencies` VALUES (30,29);
INSERT INTO `task_dependencies` VALUES (31,30);
/*!40000 ALTER TABLE `task_dependencies` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Administrador','admin@grupohouse.local','$2b$12$MCcMQnTVj1T1mKNh/67yo.i97ssC3zhiutsWg9YmdpCIKfEcQWBI.','ACTIVE','2026-11-12 19:24:51.333257','2026-11-12 19:24:51.333257');
INSERT INTO `users` VALUES (4,'Gestor Demo','gestor.demo@grupohouse.local','$2b$12$PaWO2xVsjNQgc0qGma20/OjbkeOFnoKct.eqOc3G0NBneGwZEyhiK','ACTIVE','2026-11-13 12:59:18.066770','2026-11-13 12:59:18.066770');
INSERT INTO `users` VALUES (5,'Postor Demo','postor.demo@grupohouse.local','$2b$12$RsEcJwVLtCyABcjoGxe5Guu1WCPlXxinJWo6tk0bI/nW41C6RGa4m','ACTIVE','2026-11-13 12:59:18.839865','2026-11-13 12:59:18.839865');
INSERT INTO `users` VALUES (6,'Legal Demo','legal.demo@grupohouse.local','$2b$12$BfinWUi0ERRC2VhAjoTsYemLoo/QB.PSSis8UgNbUM9Ynybi.Jbri','ACTIVE','2026-11-13 12:59:19.599264','2026-11-13 12:59:19.599264');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `user_roles` WRITE;
/*!40000 ALTER TABLE `user_roles` DISABLE KEYS */;
INSERT INTO `user_roles` VALUES (1,1,'2026-11-12 19:24:51.343000',NULL);
INSERT INTO `user_roles` VALUES (4,2,'2026-11-13 12:59:18.070000',1);
INSERT INTO `user_roles` VALUES (5,3,'2026-11-13 12:59:18.841000',1);
INSERT INTO `user_roles` VALUES (6,4,'2026-11-13 12:59:19.601000',1);
/*!40000 ALTER TABLE `user_roles` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

