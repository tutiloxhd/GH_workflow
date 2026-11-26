-- Purpose: restore columns required by the current login account query.
-- Environment: local development database selected by the current MySQL session.
-- Effects: adds nullable columns only when they are absent; preserves existing data and columns.
-- Do not run against QA or production.

SET @workflow_schema_name = DATABASE();

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @workflow_schema_name
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'admin_new_area_id'
);
SET @statement = IF(
  @column_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `admin_new_area_id` int unsigned NULL',
  'SELECT ''users.admin_new_area_id already exists'''
);
PREPARE workflow_statement FROM @statement;
EXECUTE workflow_statement;
DEALLOCATE PREPARE workflow_statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @workflow_schema_name
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'admin_new_area_name'
);
SET @statement = IF(
  @column_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `admin_new_area_name` varchar(50) NULL',
  'SELECT ''users.admin_new_area_name already exists'''
);
PREPARE workflow_statement FROM @statement;
EXECUTE workflow_statement;
DEALLOCATE PREPARE workflow_statement;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @workflow_schema_name
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'admin_new_region'
);
SET @statement = IF(
  @column_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `admin_new_region` varchar(100) NULL',
  'SELECT ''users.admin_new_region already exists'''
);
PREPARE workflow_statement FROM @statement;
EXECUTE workflow_statement;
DEALLOCATE PREPARE workflow_statement;

-- Verify the columns expected by the login account query.
SELECT COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @workflow_schema_name
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME IN ('admin_new_area_id', 'admin_new_area_name', 'admin_new_region')
ORDER BY COLUMN_NAME;
