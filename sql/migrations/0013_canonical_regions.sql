-- Catálogo fijo de las 16 regiones de Chile, ordenadas de norte a sur.
-- Ambiente: base workflow. Reasigna users.region_id por nombre antes de reemplazar el catálogo.
ALTER TABLE `users` DROP FOREIGN KEY `fk_users_region`;
--> statement-breakpoint
CREATE TABLE `regions_canonical` (
  `id` bigint unsigned AUTO_INCREMENT NOT NULL,
  `name` varchar(100) NOT NULL,
  CONSTRAINT `regions_canonical_id` PRIMARY KEY (`id`),
  CONSTRAINT `uq_regions_canonical_name` UNIQUE (`name`)
);
--> statement-breakpoint
INSERT INTO `regions_canonical` (`id`, `name`) VALUES
  (1, 'Arica y Parinacota'),
  (2, 'Tarapacá'),
  (3, 'Antofagasta'),
  (4, 'Atacama'),
  (5, 'Coquimbo'),
  (6, 'Valparaíso'),
  (7, 'Región Metropolitana'),
  (8, 'O''Higgins'),
  (9, 'Maule'),
  (10, 'Ñuble'),
  (11, 'Biobío'),
  (12, 'La Araucanía'),
  (13, 'Los Ríos'),
  (14, 'Los Lagos'),
  (15, 'Aysén'),
  (16, 'Magallanes');
--> statement-breakpoint
UPDATE `users` AS `account`
  INNER JOIN `regions` AS `previous_region` ON `previous_region`.`id` = `account`.`region_id`
  INNER JOIN `regions_canonical` AS `canonical_region`
    ON `canonical_region`.`name` = `previous_region`.`name`
   SET `account`.`region_id` = `canonical_region`.`id`;
--> statement-breakpoint
UPDATE `users` SET `region_id` = 7
 WHERE `admin_new_user_id` IS NOT NULL AND `region_id` IS NULL;
--> statement-breakpoint
DROP TABLE `regions`;
--> statement-breakpoint
RENAME TABLE `regions_canonical` TO `regions`;
--> statement-breakpoint
ALTER TABLE `regions` AUTO_INCREMENT = 17;
--> statement-breakpoint
ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_region` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`)
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Verificación: deben ser 16 filas y ningún usuario sincronizado puede quedar sin región.
SELECT COUNT(*) AS region_count FROM `regions`;
--> statement-breakpoint
SELECT COUNT(*) AS synced_users_without_region FROM `users`
 WHERE `admin_new_user_id` IS NOT NULL AND `region_id` IS NULL;
