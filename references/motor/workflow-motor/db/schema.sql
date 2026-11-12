-- Esquema del motor de workflow.
-- Dos mitades: DEFINICIÓN (plantilla, se escribe una vez) y EJECUCIÓN (instancias y tareas reales).

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS historial, tareas, instancias, propiedades,
  plantilla_dependencias, plantilla_tareas, plantillas, usuarios;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE usuarios (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  nombre  VARCHAR(100) NOT NULL,
  email   VARCHAR(150) NOT NULL UNIQUE,
  rol     ENUM('admin','gestor','postor','legal') NOT NULL,
  activo  TINYINT(1) NOT NULL DEFAULT 1
);

-- ───────────── DEFINICIÓN ─────────────

CREATE TABLE plantillas (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  nombre   VARCHAR(100) NOT NULL,
  version  INT NOT NULL,
  activa   TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE (nombre, version)
);

CREATE TABLE plantilla_tareas (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  plantilla_id  INT NOT NULL,
  codigo        VARCHAR(10) NOT NULL,          -- 's9', '17A'… lo usa el código para reglas especiales
  nombre        VARCHAR(150) NOT NULL,
  tipo          ENUM('manual','automatica') NOT NULL,
  rol           ENUM('admin','gestor','postor','legal','sistema') NOT NULL,
  accion        VARCHAR(50) NULL,              -- solo automáticas: nombre del handler en src/automatizaciones
  rama          VARCHAR(20) NULL,              -- NULL = flujo principal; 'ADJUDICADO', etc. = rama de resultado
  orden         INT NOT NULL,
  UNIQUE (plantilla_id, codigo),
  FOREIGN KEY (plantilla_id) REFERENCES plantillas(id)
);

-- "tarea_id no se activa hasta que depende_de_id esté completada"
CREATE TABLE plantilla_dependencias (
  tarea_id       INT NOT NULL,
  depende_de_id  INT NOT NULL,
  PRIMARY KEY (tarea_id, depende_de_id),
  FOREIGN KEY (tarea_id)      REFERENCES plantilla_tareas(id),
  FOREIGN KEY (depende_de_id) REFERENCES plantilla_tareas(id)
);

-- ───────────── EJECUCIÓN ─────────────

CREATE TABLE propiedades (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  admin_new_id  INT NOT NULL UNIQUE,           -- id_propiedad en admin_new
  ubicacion     VARCHAR(255),
  comuna        VARCHAR(100),
  fecha_remate  DATETIME NULL
);

CREATE TABLE instancias (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  propiedad_id  INT NOT NULL UNIQUE,           -- UNIQUE = una propiedad nunca tiene dos flujos
  plantilla_id  INT NOT NULL,
  estado        ENUM('ACTIVO','SUSPENDIDO','CANCELADO','TERMINADO') NOT NULL DEFAULT 'ACTIVO',
  resultado     VARCHAR(20) NULL,              -- rama elegida al registrar el resultado
  gestor_id     INT NULL,
  postor_id     INT NULL,
  creado_en     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  terminado_en  DATETIME NULL,
  FOREIGN KEY (propiedad_id) REFERENCES propiedades(id),
  FOREIGN KEY (plantilla_id) REFERENCES plantillas(id),
  FOREIGN KEY (gestor_id)    REFERENCES usuarios(id),
  FOREIGN KEY (postor_id)    REFERENCES usuarios(id)
);

CREATE TABLE tareas (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  instancia_id        INT NOT NULL,
  plantilla_tarea_id  INT NOT NULL,
  estado              ENUM('bloqueada','pendiente','en_curso','completada','fallida','cancelada')
                        NOT NULL DEFAULT 'bloqueada',
  asignado_a          INT NULL,                -- NULL en tareas del sistema
  vence_en            DATETIME NULL,           -- se calculará más adelante (hoy no se usa)
  activada_en         DATETIME NULL,
  completada_en       DATETIME NULL,
  completada_por      INT NULL,
  resultado           JSON NULL,               -- datos que dejó la tarea (ej. rama elegida)
  intentos            INT NOT NULL DEFAULT 0,  -- automáticas: reintentos
  error               TEXT NULL,
  UNIQUE (instancia_id, plantilla_tarea_id),
  INDEX idx_bandeja (asignado_a, estado),
  INDEX idx_worker (estado),
  FOREIGN KEY (instancia_id)       REFERENCES instancias(id),
  FOREIGN KEY (plantilla_tarea_id) REFERENCES plantilla_tareas(id),
  FOREIGN KEY (asignado_a)         REFERENCES usuarios(id)
);

CREATE TABLE historial (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  instancia_id  INT NOT NULL,
  tarea_id      INT NULL,
  usuario_id    INT NULL,
  accion        VARCHAR(40) NOT NULL,          -- 'instancia_creada', 'tarea_activada', 'tarea_completada'…
  detalle       JSON NULL,
  fecha         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (instancia_id)
);
