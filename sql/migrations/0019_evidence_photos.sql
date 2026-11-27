-- Fotos de evidencia en la base local de workflow y aviso de evidencia a legal.
CREATE TABLE `task_evidence_photos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `task_instance_id` bigint unsigned NOT NULL,
  `uploaded_by` bigint unsigned NOT NULL,
  `mime_type` varchar(20) NOT NULL,
  `size_bytes` int unsigned NOT NULL,
  `bytes` mediumblob NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_task_evidence_photos_task` (`task_instance_id`),
  CONSTRAINT `fk_task_evidence_photos_task` FOREIGN KEY (`task_instance_id`) REFERENCES `task_instances` (`id`),
  CONSTRAINT `fk_task_evidence_photos_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_task_evidence_photos_size` CHECK (`size_bytes` BETWEEN 1 AND 5242880),
  CONSTRAINT `chk_task_evidence_photos_mime` CHECK (`mime_type` IN ('image/jpeg', 'image/png', 'image/webp'))
);
--> statement-breakpoint
ALTER TABLE `notification_rules` DROP CONSTRAINT IF EXISTS `chk_notification_rules_trigger`;
--> statement-breakpoint
ALTER TABLE `notification_rules` ADD CONSTRAINT `chk_notification_rules_trigger`
  CHECK (`event_type` IN ('TASK_ASSIGNED', 'TASK_REMINDER', 'TASK_ESCALATION', 'TASK_OVERDUE', 'TASK_COMPLETED', 'EVIDENCE_SUBMITTED', 'WORKFLOW_SUSPENDED', 'WORKFLOW_RESUMED', 'WORKFLOW_CANCELLED', 'WORKFLOW_REPROGRAMMED'));
