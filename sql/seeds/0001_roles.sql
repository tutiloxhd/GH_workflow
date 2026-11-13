-- Propósito: catálogo inicial de roles del workflow de remates.
-- Ambiente: cualquiera (desarrollo, pruebas, QA, producción). No contiene datos personales.
-- Idempotente: puede ejecutarse varias veces; solo actualiza el nombre visible.
-- Requiere: migración 0000_initial_schema aplicada.

INSERT INTO roles (code, name) VALUES
  ('ADMIN', 'Administrador'),
  ('MANAGER', 'Gestor de remates'),
  ('BIDDER', 'Responsable de participación'),
  ('LEGAL_REVIEWER', 'Responsable de revisión legal')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Verificación: debe devolver 4 filas.
SELECT code, name FROM roles ORDER BY code;
