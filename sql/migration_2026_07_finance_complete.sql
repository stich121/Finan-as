-- Finanças · atualização de cartões, faturas, parcelas e conciliação
-- Execute UMA VEZ no phpMyAdmin, com o banco atual selecionado.

SET NAMES utf8mb4;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'accounts' AND column_name = 'credit_limit');
SET @sql = IF(@exists = 0, 'ALTER TABLE accounts ADD COLUMN credit_limit DECIMAL(14,2) NULL AFTER archived', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'accounts' AND column_name = 'closing_day');
SET @sql = IF(@exists = 0, 'ALTER TABLE accounts ADD COLUMN closing_day TINYINT NULL AFTER credit_limit', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'accounts' AND column_name = 'due_day');
SET @sql = IF(@exists = 0, 'ALTER TABLE accounts ADD COLUMN due_day TINYINT NULL AFTER closing_day', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS credit_card_invoices (
  id           CHAR(36)      NOT NULL PRIMARY KEY,
  user_id      CHAR(36)      NOT NULL,
  account_id   CHAR(36)      NOT NULL,
  cycle_month  CHAR(7)       NOT NULL,
  closing_date DATE          NOT NULL,
  due_date     DATE          NOT NULL,
  status       ENUM('OPEN','CLOSED','PAID','OVERDUE') NOT NULL DEFAULT 'OPEN',
  paid_amount  DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_at      DATETIME      NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoice_account_month (account_id, cycle_month),
  KEY idx_invoices_user_due (user_id, due_date),
  KEY idx_invoices_account (account_id),
  CONSTRAINT fk_invoices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'status');
SET @sql = IF(@exists = 0, 'ALTER TABLE transactions ADD COLUMN status ENUM(''PENDING'',''CLEARED'') NOT NULL DEFAULT ''CLEARED'' AFTER source', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'invoice_id');
SET @sql = IF(@exists = 0, 'ALTER TABLE transactions ADD COLUMN invoice_id CHAR(36) NULL AFTER status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'installment_group_id');
SET @sql = IF(@exists = 0, 'ALTER TABLE transactions ADD COLUMN installment_group_id CHAR(36) NULL AFTER invoice_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'installment_number');
SET @sql = IF(@exists = 0, 'ALTER TABLE transactions ADD COLUMN installment_number SMALLINT NULL AFTER installment_group_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'installment_count');
SET @sql = IF(@exists = 0, 'ALTER TABLE transactions ADD COLUMN installment_count SMALLINT NULL AFTER installment_number', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'purchase_date');
SET @sql = IF(@exists = 0, 'ALTER TABLE transactions ADD COLUMN purchase_date DATE NULL AFTER installment_count', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_invoice_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'transactions' AND index_name = 'idx_transactions_invoice'
);
SET @sql = IF(@has_invoice_index = 0,
  'ALTER TABLE transactions ADD KEY idx_transactions_invoice (invoice_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_installment_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'transactions' AND index_name = 'idx_transactions_installment_group'
);
SET @sql = IF(@has_installment_index = 0,
  'ALTER TABLE transactions ADD KEY idx_transactions_installment_group (installment_group_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_invoice_fk = (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE() AND table_name = 'transactions'
    AND constraint_name = 'fk_transactions_invoice'
);
SET @sql = IF(@has_invoice_fk = 0,
  'ALTER TABLE transactions ADD CONSTRAINT fk_transactions_invoice FOREIGN KEY (invoice_id) REFERENCES credit_card_invoices(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
