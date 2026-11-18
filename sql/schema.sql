-- Workflow de remates judiciales
-- Esquema inicial propuesto para MySQL 8 / MariaDB con InnoDB y utf8mb4.
-- Este archivo es declarativo y revisable: no contiene DROP, TRUNCATE, datos ni credenciales.
-- Las fechas se almacenan en UTC. La conversión a America/Santiago ocurre en los límites del sistema.

SET NAMES utf8mb4;

-- =========================================================
-- IDENTIDAD Y AUTORIZACIÓN
-- =========================================================

CREATE TABLE users (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(150) NOT NULL,
  email                 VARCHAR(190) NOT NULL,
  password_hash         VARCHAR(255) NULL,
  external_identity_id  VARCHAR(190) NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  timezone              VARCHAR(50) NOT NULL DEFAULT 'America/Santiago',
  last_login_at         DATETIME(6) NULL,
  created_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                      ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_external_identity (external_identity_id),
  CONSTRAINT chk_users_status
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE roles (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(50) NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(500) NULL,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                              ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(100) NOT NULL,
  description VARCHAR(500) NULL,
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
  user_id     BIGINT UNSIGNED NOT NULL,
  role_id     BIGINT UNSIGNED NOT NULL,
  assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  assigned_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role (role_id),
  KEY idx_user_roles_assigned_by (assigned_by),
  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_roles_role
    FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_user_roles_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
  role_id       BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_role_permissions_permission (permission_id),
  CONSTRAINT fk_role_permissions_role
    FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_role_permissions_permission
    FOREIGN KEY (permission_id) REFERENCES permissions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- PROPIEDADES E INTEGRACIÓN CON EL SISTEMA DE ORIGEN
-- =========================================================

CREATE TABLE properties (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_system            VARCHAR(50) NOT NULL DEFAULT 'ADMIN_NEW',
  source_id                BIGINT UNSIGNED NOT NULL,
  address                  VARCHAR(255) NULL,
  commune                  VARCHAR(100) NULL,
  region                   VARCHAR(100) NULL,
  court                    VARCHAR(150) NULL,
  tribunal                 VARCHAR(150) NULL,
  case_reference           VARCHAR(100) NULL,
  auction_bidder_name      TEXT NULL,
  auction_payer_name       TEXT NULL,
  auction_at               DATETIME(6) NULL,
  guarantee_amount         DECIMAL(18,2) NULL,
  guarantee_payment_at     DATETIME(6) NULL,
  guarantee_window_start   TIME NULL,
  guarantee_window_end     TIME NULL,
  guarantee_return_at      DATETIME(6) NULL,
  balance_payment_at       DATETIME(6) NULL,
  source_classification    VARCHAR(50) NULL,
  source_updated_at        DATETIME(6) NULL,
  source_payload           JSON NULL,
  source_hash              CHAR(64) NULL,
  last_synced_at           DATETIME(6) NOT NULL,
  created_at               DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at               DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                           ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_properties_source (source_system, source_id),
  KEY idx_properties_auction_at (auction_at),
  KEY idx_properties_last_synced (last_synced_at),
  CONSTRAINT chk_properties_guarantee_amount
    CHECK (guarantee_amount IS NULL OR guarantee_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE property_source_changes (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  property_id        BIGINT UNSIGNED NOT NULL,
  change_type        VARCHAR(50) NOT NULL,
  previous_values    JSON NULL,
  current_values     JSON NULL,
  source_updated_at  DATETIME(6) NULL,
  detected_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  processed_at       DATETIME(6) NULL,
  processing_status  VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  error_message      TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_property_changes_property (property_id, detected_at),
  KEY idx_property_changes_processing (processing_status, detected_at),
  CONSTRAINT fk_property_changes_property
    FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT chk_property_changes_status
    CHECK (processing_status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sync_cursors (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_code             VARCHAR(50) NOT NULL,
  last_source_updated_at  DATETIME(6) NULL,
  last_source_id          BIGINT UNSIGNED NULL,
  last_started_at         DATETIME(6) NULL,
  last_completed_at       DATETIME(6) NULL,
  last_status             VARCHAR(20) NOT NULL DEFAULT 'NEVER_RUN',
  last_error              TEXT NULL,
  created_at              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at              DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                              ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_sync_cursors_source (source_code),
  CONSTRAINT chk_sync_cursors_status
    CHECK (last_status IN ('NEVER_RUN', 'RUNNING', 'SUCCEEDED', 'FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sync_executions (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_code       VARCHAR(50) NOT NULL,
  status            VARCHAR(20) NOT NULL,
  started_at        DATETIME(6) NOT NULL,
  completed_at      DATETIME(6) NULL,
  records_read      INT UNSIGNED NOT NULL DEFAULT 0,
  records_created   INT UNSIGNED NOT NULL DEFAULT 0,
  records_updated   INT UNSIGNED NOT NULL DEFAULT 0,
  warning_count     INT UNSIGNED NOT NULL DEFAULT 0,
  error_count       INT UNSIGNED NOT NULL DEFAULT 0,
  error_message     TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_sync_executions_source_started (source_code, started_at),
  KEY idx_sync_executions_status (status, started_at),
  CONSTRAINT chk_sync_executions_status
    CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- DEFINICIÓN VERSIONADA DEL WORKFLOW
-- =========================================================

CREATE TABLE workflow_definitions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(100) NOT NULL,
  name        VARCHAR(150) NOT NULL,
  description TEXT NULL,
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                              ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_workflow_definitions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workflow_definition_versions (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workflow_definition_id   BIGINT UNSIGNED NOT NULL,
  version_number           INT UNSIGNED NOT NULL,
  status                   VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  published_at             DATETIME(6) NULL,
  published_by             BIGINT UNSIGNED NULL,
  created_at               DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at               DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                       ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_workflow_versions_number (workflow_definition_id, version_number),
  KEY idx_workflow_versions_status (workflow_definition_id, status),
  KEY idx_workflow_versions_publisher (published_by),
  CONSTRAINT fk_workflow_versions_definition
    FOREIGN KEY (workflow_definition_id) REFERENCES workflow_definitions(id),
  CONSTRAINT fk_workflow_versions_publisher
    FOREIGN KEY (published_by) REFERENCES users(id),
  CONSTRAINT chk_workflow_versions_status
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workflow_branches (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workflow_version_id  BIGINT UNSIGNED NOT NULL,
  code                 VARCHAR(50) NOT NULL,
  name                 VARCHAR(100) NOT NULL,
  description          TEXT NULL,
  display_order        INT NOT NULL DEFAULT 0,
  created_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_workflow_branches_code (workflow_version_id, code),
  CONSTRAINT fk_workflow_branches_version
    FOREIGN KEY (workflow_version_id) REFERENCES workflow_definition_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE task_definitions (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workflow_version_id  BIGINT UNSIGNED NOT NULL,
  branch_id            BIGINT UNSIGNED NULL,
  code                 VARCHAR(50) NOT NULL,
  name                 VARCHAR(150) NOT NULL,
  description          TEXT NULL,
  task_type            VARCHAR(20) NOT NULL,
  assignment_type      VARCHAR(30) NOT NULL,
  required_role_code   VARCHAR(50) NULL,
  automation_action    VARCHAR(100) NULL,
  display_order        INT NOT NULL DEFAULT 0,
  blocks_completion    BOOLEAN NOT NULL DEFAULT TRUE,
  can_be_skipped       BOOLEAN NOT NULL DEFAULT FALSE,
  max_attempts         INT UNSIGNED NULL,
  timeout_seconds      INT UNSIGNED NULL,
  created_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_task_definitions_code (workflow_version_id, code),
  KEY idx_task_definitions_branch (branch_id),
  KEY idx_task_definitions_display (workflow_version_id, display_order),
  CONSTRAINT fk_task_definitions_version
    FOREIGN KEY (workflow_version_id) REFERENCES workflow_definition_versions(id),
  CONSTRAINT fk_task_definitions_branch
    FOREIGN KEY (branch_id) REFERENCES workflow_branches(id),
  CONSTRAINT chk_task_definitions_type
    CHECK (task_type IN ('MANUAL', 'AUTOMATIC')),
  CONSTRAINT chk_task_definitions_assignment
    CHECK (assignment_type IN (
      'ROLE', 'INSTANCE_MANAGER', 'INSTANCE_BIDDER',
      'EXPLICIT_USER', 'SYSTEM'
    ))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE task_dependencies (
  task_definition_id             BIGINT UNSIGNED NOT NULL,
  depends_on_task_definition_id  BIGINT UNSIGNED NOT NULL,
  dependency_type                VARCHAR(20) NOT NULL DEFAULT 'ALL_COMPLETED',
  PRIMARY KEY (task_definition_id, depends_on_task_definition_id),
  KEY idx_task_dependencies_parent (depends_on_task_definition_id),
  CONSTRAINT fk_task_dependencies_task
    FOREIGN KEY (task_definition_id) REFERENCES task_definitions(id),
  CONSTRAINT fk_task_dependencies_parent
    FOREIGN KEY (depends_on_task_definition_id) REFERENCES task_definitions(id),
  CONSTRAINT chk_task_dependencies_not_self
    CHECK (task_definition_id <> depends_on_task_definition_id),
  CONSTRAINT chk_task_dependencies_type
    CHECK (dependency_type IN ('ALL_COMPLETED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE deadline_definitions (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_definition_id       BIGINT UNSIGNED NOT NULL,
  reference_type           VARCHAR(50) NOT NULL,
  offset_minutes           INT NOT NULL DEFAULT 0,
  calculation_direction    VARCHAR(10) NOT NULL DEFAULT 'AFTER',
  business_calendar_code   VARCHAR(50) NULL,
  missing_reference_policy VARCHAR(30) NOT NULL DEFAULT 'LEAVE_UNSCHEDULED',
  suspension_policy        VARCHAR(30) NOT NULL DEFAULT 'KEEP_DUE_DATE',
  created_at               DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_deadline_definitions_task (task_definition_id),
  CONSTRAINT fk_deadline_definitions_task
    FOREIGN KEY (task_definition_id) REFERENCES task_definitions(id),
  CONSTRAINT chk_deadline_direction
    CHECK (calculation_direction IN ('BEFORE', 'AFTER')),
  CONSTRAINT chk_deadline_missing_reference
    CHECK (missing_reference_policy IN ('LEAVE_UNSCHEDULED', 'BLOCK_TASK', 'FAIL_WORKFLOW')),
  CONSTRAINT chk_deadline_suspension
    CHECK (suspension_policy IN ('KEEP_DUE_DATE', 'SHIFT_BY_SUSPENSION', 'RECALCULATE_FROM_REFERENCE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- EJECUCIÓN DEL WORKFLOW
-- =========================================================

CREATE TABLE workflow_instances (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  property_id          BIGINT UNSIGNED NOT NULL,
  workflow_version_id  BIGINT UNSIGNED NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  selected_branch_id   BIGINT UNSIGNED NULL,
  started_at           DATETIME(6) NOT NULL,
  suspended_at         DATETIME(6) NULL,
  cancelled_at         DATETIME(6) NULL,
  completed_at         DATETIME(6) NULL,
  created_by           BIGINT UNSIGNED NULL,
  lock_version         INT UNSIGNED NOT NULL DEFAULT 1,
  created_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                   ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_workflow_instances_property_version (property_id, workflow_version_id),
  KEY idx_workflow_instances_status (status, started_at),
  KEY idx_workflow_instances_version (workflow_version_id),
  KEY idx_workflow_instances_branch (selected_branch_id),
  KEY idx_workflow_instances_creator (created_by),
  CONSTRAINT fk_workflow_instances_property
    FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_workflow_instances_version
    FOREIGN KEY (workflow_version_id) REFERENCES workflow_definition_versions(id),
  CONSTRAINT fk_workflow_instances_branch
    FOREIGN KEY (selected_branch_id) REFERENCES workflow_branches(id),
  CONSTRAINT fk_workflow_instances_creator
    FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_workflow_instances_status
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'COMPLETED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workflow_instance_participants (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL,
  participant_type      VARCHAR(50) NOT NULL,
  user_id               BIGINT UNSIGNED NOT NULL,
  is_primary            BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from            DATETIME(6) NOT NULL,
  valid_to              DATETIME(6) NULL,
  assigned_by           BIGINT UNSIGNED NULL,
  created_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_instance_participants_current
    (workflow_instance_id, participant_type, valid_to),
  KEY idx_instance_participants_user (user_id, valid_to),
  KEY idx_instance_participants_assigner (assigned_by),
  CONSTRAINT fk_instance_participants_instance
    FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id),
  CONSTRAINT fk_instance_participants_user
    FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_instance_participants_assigner
    FOREIGN KEY (assigned_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workflow_suspensions (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL,
  reason_code           VARCHAR(50) NULL,
  reason                TEXT NOT NULL,
  suspended_at          DATETIME(6) NOT NULL,
  suspended_by          BIGINT UNSIGNED NOT NULL,
  resumed_at            DATETIME(6) NULL,
  resumed_by            BIGINT UNSIGNED NULL,
  resume_notes          TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_workflow_suspensions_instance (workflow_instance_id, suspended_at),
  KEY idx_workflow_suspensions_suspended_by (suspended_by),
  KEY idx_workflow_suspensions_resumed_by (resumed_by),
  CONSTRAINT fk_workflow_suspensions_instance
    FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id),
  CONSTRAINT fk_workflow_suspensions_suspended_by
    FOREIGN KEY (suspended_by) REFERENCES users(id),
  CONSTRAINT fk_workflow_suspensions_resumed_by
    FOREIGN KEY (resumed_by) REFERENCES users(id),
  CONSTRAINT chk_workflow_suspensions_dates
    CHECK (resumed_at IS NULL OR resumed_at >= suspended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE task_instances (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL,
  task_definition_id    BIGINT UNSIGNED NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'BLOCKED',
  assigned_user_id      BIGINT UNSIGNED NULL,
  backup_user_id        BIGINT UNSIGNED NULL,
  due_at                DATETIME(6) NULL,
  due_reference_at      DATETIME(6) NULL,
  activated_at          DATETIME(6) NULL,
  started_at            DATETIME(6) NULL,
  completed_at          DATETIME(6) NULL,
  completed_by          BIGINT UNSIGNED NULL,
  failed_at             DATETIME(6) NULL,
  result_payload        JSON NULL,
  lock_version          INT UNSIGNED NOT NULL DEFAULT 1,
  created_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                      ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_task_instances_definition
    (workflow_instance_id, task_definition_id),
  KEY idx_task_instances_assignee (assigned_user_id, status, due_at),
  KEY idx_task_instances_backup (backup_user_id, status, due_at),
  KEY idx_task_instances_workflow (workflow_instance_id, status),
  KEY idx_task_instances_due (status, due_at),
  KEY idx_task_instances_definition (task_definition_id),
  KEY idx_task_instances_completed_by (completed_by),
  CONSTRAINT fk_task_instances_workflow
    FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id),
  CONSTRAINT fk_task_instances_definition
    FOREIGN KEY (task_definition_id) REFERENCES task_definitions(id),
  CONSTRAINT fk_task_instances_assignee
    FOREIGN KEY (assigned_user_id) REFERENCES users(id),
  CONSTRAINT fk_task_instances_backup
    FOREIGN KEY (backup_user_id) REFERENCES users(id),
  CONSTRAINT fk_task_instances_completed_by
    FOREIGN KEY (completed_by) REFERENCES users(id),
  CONSTRAINT chk_task_instances_status
    CHECK (status IN ('BLOCKED', 'READY', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE task_assignments (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_instance_id  BIGINT UNSIGNED NOT NULL,
  assignment_type   VARCHAR(20) NOT NULL,
  user_id           BIGINT UNSIGNED NOT NULL,
  assigned_at       DATETIME(6) NOT NULL,
  assigned_by       BIGINT UNSIGNED NULL,
  ended_at          DATETIME(6) NULL,
  reason            TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_task_assignments_current (task_instance_id, assignment_type, ended_at),
  KEY idx_task_assignments_user (user_id, ended_at),
  KEY idx_task_assignments_assigner (assigned_by),
  CONSTRAINT fk_task_assignments_task
    FOREIGN KEY (task_instance_id) REFERENCES task_instances(id),
  CONSTRAINT fk_task_assignments_user
    FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_task_assignments_assigner
    FOREIGN KEY (assigned_by) REFERENCES users(id),
  CONSTRAINT chk_task_assignments_type
    CHECK (assignment_type IN ('PRIMARY', 'BACKUP')),
  CONSTRAINT chk_task_assignments_dates
    CHECK (ended_at IS NULL OR ended_at >= assigned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE task_comments (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_instance_id  BIGINT UNSIGNED NOT NULL,
  author_user_id    BIGINT UNSIGNED NOT NULL,
  body              TEXT NOT NULL,
  created_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at        DATETIME(6) NULL,
  deleted_at        DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_task_comments_task (task_instance_id, created_at),
  KEY idx_task_comments_author (author_user_id),
  CONSTRAINT fk_task_comments_task
    FOREIGN KEY (task_instance_id) REFERENCES task_instances(id),
  CONSTRAINT fk_task_comments_author
    FOREIGN KEY (author_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workflow_events (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workflow_instance_id  BIGINT UNSIGNED NOT NULL,
  task_instance_id      BIGINT UNSIGNED NULL,
  event_type            VARCHAR(60) NOT NULL,
  actor_user_id         BIGINT UNSIGNED NULL,
  event_source          VARCHAR(20) NOT NULL,
  correlation_id        CHAR(36) NULL,
  request_id            VARCHAR(100) NULL,
  previous_status       VARCHAR(20) NULL,
  current_status        VARCHAR(20) NULL,
  details               JSON NULL,
  occurred_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_workflow_events_instance (workflow_instance_id, occurred_at),
  KEY idx_workflow_events_task (task_instance_id, occurred_at),
  KEY idx_workflow_events_actor (actor_user_id, occurred_at),
  KEY idx_workflow_events_correlation (correlation_id),
  CONSTRAINT fk_workflow_events_instance
    FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id),
  CONSTRAINT fk_workflow_events_task
    FOREIGN KEY (task_instance_id) REFERENCES task_instances(id),
  CONSTRAINT fk_workflow_events_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id),
  CONSTRAINT chk_workflow_events_source
    CHECK (event_source IN ('USER', 'SYSTEM', 'WORKER', 'SYNC'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- JOBS, INTENTOS Y OUTBOX
-- =========================================================

CREATE TABLE jobs (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_type              VARCHAR(100) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  payload               JSON NOT NULL,
  workflow_instance_id  BIGINT UNSIGNED NULL,
  task_instance_id      BIGINT UNSIGNED NULL,
  idempotency_key       VARCHAR(190) NOT NULL,
  priority              SMALLINT NOT NULL DEFAULT 0,
  available_at          DATETIME(6) NOT NULL,
  reserved_at           DATETIME(6) NULL,
  reserved_by           VARCHAR(100) NULL,
  lease_expires_at      DATETIME(6) NULL,
  started_at            DATETIME(6) NULL,
  completed_at          DATETIME(6) NULL,
  attempts              INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts          INT UNSIGNED NOT NULL DEFAULT 3,
  last_error_code       VARCHAR(100) NULL,
  last_error_message    TEXT NULL,
  created_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                      ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_jobs_idempotency (idempotency_key),
  KEY idx_jobs_worker (status, available_at, priority),
  KEY idx_jobs_lease (lease_expires_at),
  KEY idx_jobs_workflow (workflow_instance_id),
  KEY idx_jobs_task (task_instance_id),
  CONSTRAINT fk_jobs_workflow
    FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id),
  CONSTRAINT fk_jobs_task
    FOREIGN KEY (task_instance_id) REFERENCES task_instances(id),
  CONSTRAINT chk_jobs_status
    CHECK (status IN ('PENDING', 'RESERVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  CONSTRAINT chk_jobs_attempts
    CHECK (attempts <= max_attempts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE job_attempts (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id            BIGINT UNSIGNED NOT NULL,
  attempt_number    INT UNSIGNED NOT NULL,
  worker_id         VARCHAR(100) NOT NULL,
  started_at        DATETIME(6) NOT NULL,
  completed_at      DATETIME(6) NULL,
  status            VARCHAR(20) NOT NULL,
  error_code        VARCHAR(100) NULL,
  error_message     TEXT NULL,
  result_payload    JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_job_attempts_number (job_id, attempt_number),
  CONSTRAINT fk_job_attempts_job
    FOREIGN KEY (job_id) REFERENCES jobs(id),
  CONSTRAINT chk_job_attempts_status
    CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'ABANDONED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE outbox_events (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type      VARCHAR(100) NOT NULL,
  aggregate_type  VARCHAR(50) NOT NULL,
  aggregate_id    BIGINT UNSIGNED NOT NULL,
  payload         JSON NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  available_at    DATETIME(6) NOT NULL,
  published_at    DATETIME(6) NULL,
  attempts        INT UNSIGNED NOT NULL DEFAULT 0,
  last_error      TEXT NULL,
  created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                  ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_outbox_events_dispatch (status, available_at),
  KEY idx_outbox_events_aggregate (aggregate_type, aggregate_id),
  CONSTRAINT chk_outbox_events_status
    CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- DOCUMENTOS
-- =========================================================

CREATE TABLE documents (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  property_id           BIGINT UNSIGNED NOT NULL,
  workflow_instance_id  BIGINT UNSIGNED NULL,
  task_instance_id      BIGINT UNSIGNED NULL,
  document_type         VARCHAR(100) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  status                VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_by            BIGINT UNSIGNED NULL,
  created_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                      ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_documents_property (property_id, document_type),
  KEY idx_documents_workflow (workflow_instance_id),
  KEY idx_documents_task (task_instance_id),
  KEY idx_documents_creator (created_by),
  CONSTRAINT fk_documents_property
    FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_documents_workflow
    FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id),
  CONSTRAINT fk_documents_task
    FOREIGN KEY (task_instance_id) REFERENCES task_instances(id),
  CONSTRAINT fk_documents_creator
    FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_documents_status
    CHECK (status IN ('PENDING', 'UPLOADED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE document_versions (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id        BIGINT UNSIGNED NOT NULL,
  version_number     INT UNSIGNED NOT NULL,
  storage_provider   VARCHAR(30) NOT NULL,
  storage_key        VARCHAR(500) NOT NULL,
  original_filename  VARCHAR(255) NOT NULL,
  content_type       VARCHAR(150) NOT NULL,
  size_bytes         BIGINT UNSIGNED NOT NULL,
  checksum_sha256    CHAR(64) NOT NULL,
  uploaded_by        BIGINT UNSIGNED NULL,
  created_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_document_versions_number (document_id, version_number),
  UNIQUE KEY uq_document_versions_storage (storage_provider, storage_key),
  KEY idx_document_versions_uploader (uploaded_by),
  CONSTRAINT fk_document_versions_document
    FOREIGN KEY (document_id) REFERENCES documents(id),
  CONSTRAINT fk_document_versions_uploader
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- NOTIFICACIONES
-- =========================================================

CREATE TABLE notifications (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id               BIGINT UNSIGNED NOT NULL,
  notification_type     VARCHAR(100) NOT NULL,
  title                 VARCHAR(200) NOT NULL,
  body                  TEXT NOT NULL,
  workflow_instance_id  BIGINT UNSIGNED NULL,
  task_instance_id      BIGINT UNSIGNED NULL,
  deduplication_key     VARCHAR(190) NOT NULL,
  read_at               DATETIME(6) NULL,
  created_at            DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_deduplication (deduplication_key),
  KEY idx_notifications_user (user_id, read_at, created_at),
  KEY idx_notifications_workflow (workflow_instance_id),
  KEY idx_notifications_task (task_instance_id),
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_notifications_workflow
    FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id),
  CONSTRAINT fk_notifications_task
    FOREIGN KEY (task_instance_id) REFERENCES task_instances(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_deliveries (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  notification_id      BIGINT UNSIGNED NOT NULL,
  channel              VARCHAR(20) NOT NULL,
  destination          VARCHAR(255) NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  provider_message_id  VARCHAR(190) NULL,
  attempts             INT UNSIGNED NOT NULL DEFAULT 0,
  scheduled_at         DATETIME(6) NOT NULL,
  sent_at              DATETIME(6) NULL,
  failed_at            DATETIME(6) NULL,
  last_error           TEXT NULL,
  created_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                       ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_notification_deliveries_send (status, scheduled_at),
  KEY idx_notification_deliveries_notification (notification_id),
  CONSTRAINT fk_notification_deliveries_notification
    FOREIGN KEY (notification_id) REFERENCES notifications(id),
  CONSTRAINT chk_notification_deliveries_channel
    CHECK (channel IN ('IN_APP', 'EMAIL')),
  CONSTRAINT chk_notification_deliveries_status
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

