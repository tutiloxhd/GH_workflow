-- Propósito: propiedades ficticias para probar el motor antes de la sincronización con admin_new.
-- Ambiente: SOLO desarrollo local. No ejecutar en QA ni producción.
-- Los admin_new_id empiezan en 9000000001, por encima del máximo de INT (2147483647):
-- admin_new.propiedad.id_propiedad es int(11), así que nunca pueden coincidir con un id real.
-- Idempotente: INSERT IGNORE sobre la clave única admin_new_id.
-- Fechas en UTC (Santiago = UTC-3 en noviembre y diciembre de 2026).

INSERT IGNORE INTO properties
  (admin_new_id, title, address, commune, region, court, tribunal, case_reference,
   auction_at, guarantee_amount, last_synced_at)
VALUES
  (9000000001, 'Casa Sintética Los Alerces 1450', 'Los Alerces 1450', 'Las Condes',
   'Metropolitana', 'Corte de Apelaciones de Santiago', '1° Juzgado Civil de Santiago',
   'C-0000-2026', '2026-12-07 13:00:00.000000', 42000000.00, UTC_TIMESTAMP(6)),
  (9000000002, 'Depto. Sintético San Martín 588', 'San Martín 588', 'Santiago',
   'Metropolitana', 'Corte de Apelaciones de Santiago', '2° Juzgado Civil de Santiago',
   'C-0001-2026', '2026-12-09 18:30:00.000000', 9500000.00, UTC_TIMESTAMP(6)),
  (9000000003, 'Casa Sintética El Roble 972', 'El Roble 972', 'Ñuñoa',
   'Metropolitana', 'Corte de Apelaciones de Santiago', '3° Juzgado Civil de Santiago',
   'C-0002-2026', NULL, NULL, UTC_TIMESTAMP(6));

-- Verificación: debe devolver 3 filas.
SELECT id, admin_new_id, title, auction_at FROM properties WHERE admin_new_id > 9000000000 ORDER BY admin_new_id;
