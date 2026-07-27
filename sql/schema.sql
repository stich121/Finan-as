-- Finanças - schema MySQL/MariaDB
-- Rodar uma vez via phpMyAdmin (hPanel) no banco criado para o app.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(190)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  currency      VARCHAR(8)    NOT NULL DEFAULT 'BRL',
  theme         ENUM('system','light','dark') NOT NULL DEFAULT 'system',
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accounts (
  id          CHAR(36)      NOT NULL PRIMARY KEY,
  user_id     CHAR(36)      NOT NULL,
  name        VARCHAR(120)  NOT NULL,
  type        ENUM('CHECKING','SAVINGS','CREDIT_CARD','CASH','INVESTMENT') NOT NULL,
  institution VARCHAR(120)  NULL,
  balance     DECIMAL(14,2) NOT NULL DEFAULT 0,
  color       VARCHAR(20)   NULL,
  archived    TINYINT(1)    NOT NULL DEFAULT 0,
  credit_limit DECIMAL(14,2) NULL, -- só cartão de crédito
  closing_day  TINYINT      NULL, -- dia do fechamento da fatura (1-28)
  due_day      TINYINT      NULL, -- dia do vencimento da fatura (1-28)
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_accounts_user (user_id),
  CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  name       VARCHAR(120) NOT NULL,
  kind       ENUM('INCOME','EXPENSE') NOT NULL,
  parent_id  CHAR(36)     NULL,
  color      VARCHAR(20)  NULL,
  icon       VARCHAR(40)  NULL,
  is_essential TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_categories_user (user_id),
  KEY idx_categories_parent (parent_id),
  CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tags (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  name       VARCHAR(60)  NOT NULL,
  color      VARCHAR(20)  NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tags_user_name (user_id, name),
  CONSTRAINT fk_tags_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
  id                 CHAR(36)      NOT NULL PRIMARY KEY,
  user_id            CHAR(36)      NOT NULL,
  account_id         CHAR(36)      NOT NULL,
  category_id        CHAR(36)      NULL,
  type               ENUM('INCOME','EXPENSE','TRANSFER') NOT NULL,
  amount             DECIMAL(14,2) NOT NULL,
  date               DATE          NOT NULL,
  description        VARCHAR(255)  NULL,
  payee              VARCHAR(190)  NULL,
  memo               VARCHAR(255)  NULL,
  fit_id             VARCHAR(190)  NULL,
  transfer_account_id CHAR(36)     NULL,
  transfer_group_id  CHAR(36)      NULL,
  source             ENUM('MANUAL','OFX') NOT NULL DEFAULT 'MANUAL',
  status             ENUM('PENDING','CLEARED') NOT NULL DEFAULT 'CLEARED',
  invoice_id         CHAR(36)      NULL,
  installment_group_id CHAR(36)    NULL,
  installment_number SMALLINT      NULL,
  installment_count SMALLINT       NULL,
  purchase_date      DATE          NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_transactions_account_fit (account_id, fit_id),
  KEY idx_transactions_user (user_id),
  KEY idx_transactions_account (account_id),
  KEY idx_transactions_category (category_id),
  KEY idx_transactions_date (date),
  KEY idx_transactions_transfer_group (transfer_group_id),
  KEY idx_transactions_invoice (invoice_id),
  KEY idx_transactions_installment_group (installment_group_id),
  CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_transactions_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_transactions_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_transfer_account FOREIGN KEY (transfer_account_id) REFERENCES accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credit_card_invoices (
  id           CHAR(36)      NOT NULL PRIMARY KEY,
  user_id      CHAR(36)      NOT NULL,
  account_id   CHAR(36)      NOT NULL,
  cycle_month  CHAR(7)       NOT NULL, -- mês do vencimento: YYYY-MM
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

ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_invoice
  FOREIGN KEY (invoice_id) REFERENCES credit_card_invoices(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id CHAR(36) NOT NULL,
  tag_id         CHAR(36) NOT NULL,
  PRIMARY KEY (transaction_id, tag_id),
  CONSTRAINT fk_tt_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_tt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS category_rules (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  user_id     CHAR(36)     NOT NULL,
  category_id CHAR(36)     NOT NULL,
  match_field ENUM('DESCRIPTION','PAYEE','MEMO') NOT NULL,
  match_type  ENUM('CONTAINS','STARTS_WITH','REGEX','EQUALS') NOT NULL,
  pattern     VARCHAR(255) NOT NULL,
  priority    INT          NOT NULL DEFAULT 0,
  enabled     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rules_user (user_id),
  KEY idx_rules_category (category_id),
  CONSTRAINT fk_rules_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rules_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budgets (
  id          CHAR(36)      NOT NULL PRIMARY KEY,
  user_id     CHAR(36)      NOT NULL,
  category_id CHAR(36)      NOT NULL,
  month       CHAR(7)       NOT NULL, -- 'YYYY-MM'
  amount      DECIMAL(14,2) NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budgets_user_category_month (user_id, category_id, month),
  KEY idx_budgets_user_month (user_id, month),
  CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_budgets_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id             CHAR(36)      NOT NULL PRIMARY KEY,
  user_id        CHAR(36)      NOT NULL,
  account_id     CHAR(36)      NOT NULL,
  category_id    CHAR(36)      NULL,
  type           ENUM('INCOME','EXPENSE') NOT NULL,
  amount         DECIMAL(14,2) NOT NULL,
  description    VARCHAR(255)  NOT NULL,
  frequency      ENUM('WEEKLY','BIWEEKLY','MONTHLY','YEARLY') NOT NULL,
  start_date     DATE          NOT NULL,
  end_date       DATE          NULL,
  next_run_date  DATE          NOT NULL,
  auto_post      TINYINT(1)    NOT NULL DEFAULT 0,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_recurring_user (user_id),
  KEY idx_recurring_account (account_id),
  CONSTRAINT fk_recurring_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_recurring_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_recurring_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ofx_staging (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  account_id CHAR(36)     NOT NULL,
  payload    LONGTEXT     NOT NULL, -- JSON com as transações pré-processadas
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ofx_staging_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ofx_staging_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS goals (
  id             CHAR(36)      NOT NULL PRIMARY KEY,
  user_id        CHAR(36)      NOT NULL,
  name           VARCHAR(120)  NOT NULL,
  target_amount  DECIMAL(14,2) NOT NULL,
  current_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  target_date    DATE          NULL,
  color          VARCHAR(20)   NULL,
  achieved_at    DATETIME      NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_goals_user (user_id),
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_reconciliations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  statement_balance DECIMAL(14,2) NOT NULL,
  app_balance DECIMAL(14,2) NOT NULL,
  difference DECIMAL(14,2) NOT NULL,
  reconciled_at DATETIME NOT NULL,
  note VARCHAR(255) NULL,
  KEY idx_reconciliations_user_date (user_id, reconciled_at),
  CONSTRAINT fk_reconciliations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reconciliations_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS debts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(140) NOT NULL,
  balance DECIMAL(14,2) NOT NULL,
  annual_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
  minimum_payment DECIMAL(14,2) NOT NULL DEFAULT 0,
  due_day TINYINT NULL,
  status ENUM('ACTIVE','PAID') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_debts_user_status (user_id, status),
  CONSTRAINT fk_debts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shared_expenses (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  description VARCHAR(190) NOT NULL,
  person_name VARCHAR(120) NOT NULL,
  person_email VARCHAR(190) NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  person_amount DECIMAL(14,2) NOT NULL,
  due_date DATE NULL,
  status ENUM('PENDING','PAID') NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_shared_expenses_user_status (user_id, status),
  CONSTRAINT fk_shared_expenses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shared_wallets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  member_name VARCHAR(120) NULL,
  member_email VARCHAR(190) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_shared_wallets_user (user_id),
  CONSTRAINT fk_shared_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shared_wallet_entries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  wallet_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  description VARCHAR(190) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  paid_by VARCHAR(120) NULL,
  entry_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wallet_entries_wallet_date (wallet_id, entry_date),
  CONSTRAINT fk_wallet_entries_wallet FOREIGN KEY (wallet_id) REFERENCES shared_wallets(id) ON DELETE CASCADE,
  CONSTRAINT fk_wallet_entries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monthly_closings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  month CHAR(7) NOT NULL,
  checklist_json TEXT NOT NULL,
  closed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_monthly_closing (user_id, month),
  CONSTRAINT fk_monthly_closings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_snapshots (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  snapshot_date DATE NOT NULL,
  net_worth DECIMAL(14,2) NOT NULL,
  assets DECIMAL(14,2) NOT NULL,
  liabilities DECIMAL(14,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_financial_snapshot (user_id, snapshot_date),
  KEY idx_financial_snapshots_user_date (user_id, snapshot_date),
  CONSTRAINT fk_financial_snapshots_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_log (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id CHAR(36) NULL,
  description VARCHAR(255) NOT NULL,
  snapshot_json LONGTEXT NULL,
  undoable TINYINT(1) NOT NULL DEFAULT 0,
  undone_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_activity_user_date (user_id, created_at),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transaction_splits (
  id CHAR(36) NOT NULL PRIMARY KEY,
  transaction_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  category_id CHAR(36) NULL,
  amount DECIMAL(14,2) NOT NULL,
  note VARCHAR(190) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_splits_transaction (transaction_id),
  CONSTRAINT fk_splits_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_splits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_splits_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transaction_attachments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  transaction_id CHAR(36) NULL,
  user_id CHAR(36) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT NOT NULL,
  ocr_text TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_attachments_user (user_id),
  KEY idx_attachments_transaction (transaction_id),
  CONSTRAINT fk_attachments_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
