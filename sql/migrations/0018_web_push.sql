-- Propósito: suscripciones y entregas Web Push (MariaDB/MySQL).
-- Ambiente: preparar para desarrollo/QA/producción; no ejecutar sin aprobación.
-- No destruye datos existentes. El snapshot de Drizzle sigue desfasado respecto
-- al esquema actual; este SQL y su entrada de journal son revisables por separado.
CREATE TABLE `push_subscriptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `endpoint` varchar(2048) NOT NULL,
  `endpoint_hash` varchar(64) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `revoked_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_subscriptions_endpoint_hash` (`endpoint_hash`),
  KEY `idx_push_subscriptions_user` (`user_id`,`revoked_at`),
  CONSTRAINT `fk_push_subscriptions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
);
--> statement-breakpoint

CREATE TABLE `push_deliveries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `notification_id` bigint unsigned NOT NULL,
  `subscription_id` bigint unsigned NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `available_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `locked_by` varchar(100) DEFAULT NULL,
  `locked_until` datetime(6) DEFAULT NULL,
  `attempts` int unsigned NOT NULL DEFAULT 0,
  `last_error` varchar(100) DEFAULT NULL,
  `completed_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_deliveries_notification_subscription` (`notification_id`,`subscription_id`),
  KEY `idx_push_deliveries_due` (`status`,`available_at`),
  KEY `idx_push_deliveries_lease` (`locked_until`),
  CONSTRAINT `fk_push_deliveries_notification` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`),
  CONSTRAINT `fk_push_deliveries_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions` (`id`),
  CONSTRAINT `chk_push_deliveries_status` CHECK (`status` IN ('PENDING','PROCESSING','COMPLETED','CANCELLED','FAILED'))
);

-- Verificación posterior a la aplicación autorizada:
-- SHOW CREATE TABLE push_subscriptions;
-- SHOW CREATE TABLE push_deliveries;
