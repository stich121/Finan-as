<?php

declare(strict_types=1);

function productivity_ensure_schema(PDO $pdo): void
{
    static $ready = false;
    if ($ready) {
        return;
    }

    if (!db_column_exists($pdo, 'categories', 'is_essential')) {
        $pdo->exec('ALTER TABLE categories ADD COLUMN is_essential TINYINT(1) NOT NULL DEFAULT 0 AFTER icon');
    }

    $tables = [
        "CREATE TABLE IF NOT EXISTS account_reconciliations (
          id CHAR(36) NOT NULL PRIMARY KEY, user_id CHAR(36) NOT NULL, account_id CHAR(36) NOT NULL,
          statement_balance DECIMAL(14,2) NOT NULL, app_balance DECIMAL(14,2) NOT NULL,
          difference DECIMAL(14,2) NOT NULL, reconciled_at DATETIME NOT NULL, note VARCHAR(255) NULL,
          KEY idx_reconciliations_user_date (user_id, reconciled_at),
          CONSTRAINT fk_reconciliations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_reconciliations_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS debts (
          id CHAR(36) NOT NULL PRIMARY KEY, user_id CHAR(36) NOT NULL, name VARCHAR(140) NOT NULL,
          balance DECIMAL(14,2) NOT NULL, annual_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
          minimum_payment DECIMAL(14,2) NOT NULL DEFAULT 0, due_day TINYINT NULL,
          status ENUM('ACTIVE','PAID') NOT NULL DEFAULT 'ACTIVE',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_debts_user_status (user_id, status),
          CONSTRAINT fk_debts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS shared_expenses (
          id CHAR(36) NOT NULL PRIMARY KEY, user_id CHAR(36) NOT NULL, description VARCHAR(190) NOT NULL,
          person_name VARCHAR(120) NOT NULL, person_email VARCHAR(190) NULL,
          total_amount DECIMAL(14,2) NOT NULL, person_amount DECIMAL(14,2) NOT NULL,
          due_date DATE NULL, status ENUM('PENDING','PAID') NOT NULL DEFAULT 'PENDING',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_shared_expenses_user_status (user_id, status),
          CONSTRAINT fk_shared_expenses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS shared_wallets (
          id CHAR(36) NOT NULL PRIMARY KEY, user_id CHAR(36) NOT NULL, name VARCHAR(120) NOT NULL,
          member_name VARCHAR(120) NULL, member_email VARCHAR(190) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_shared_wallets_user (user_id),
          CONSTRAINT fk_shared_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS shared_wallet_entries (
          id CHAR(36) NOT NULL PRIMARY KEY, wallet_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
          description VARCHAR(190) NOT NULL, amount DECIMAL(14,2) NOT NULL, paid_by VARCHAR(120) NULL,
          entry_date DATE NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_wallet_entries_wallet_date (wallet_id, entry_date),
          CONSTRAINT fk_wallet_entries_wallet FOREIGN KEY (wallet_id) REFERENCES shared_wallets(id) ON DELETE CASCADE,
          CONSTRAINT fk_wallet_entries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS monthly_closings (
          id CHAR(36) NOT NULL PRIMARY KEY, user_id CHAR(36) NOT NULL, month CHAR(7) NOT NULL,
          checklist_json TEXT NOT NULL, closed_at DATETIME NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_monthly_closing (user_id, month),
          CONSTRAINT fk_monthly_closings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS financial_snapshots (
          id CHAR(36) NOT NULL PRIMARY KEY, user_id CHAR(36) NOT NULL, snapshot_date DATE NOT NULL,
          net_worth DECIMAL(14,2) NOT NULL, assets DECIMAL(14,2) NOT NULL, liabilities DECIMAL(14,2) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_financial_snapshot (user_id, snapshot_date),
          KEY idx_financial_snapshots_user_date (user_id, snapshot_date),
          CONSTRAINT fk_financial_snapshots_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS activity_log (
          id CHAR(36) NOT NULL PRIMARY KEY, user_id CHAR(36) NOT NULL, action VARCHAR(80) NOT NULL,
          entity_type VARCHAR(80) NOT NULL, entity_id CHAR(36) NULL, description VARCHAR(255) NOT NULL,
          snapshot_json LONGTEXT NULL, undoable TINYINT(1) NOT NULL DEFAULT 0, undone_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_activity_user_date (user_id, created_at),
          CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS transaction_splits (
          id CHAR(36) NOT NULL PRIMARY KEY, transaction_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
          category_id CHAR(36) NULL, amount DECIMAL(14,2) NOT NULL, note VARCHAR(190) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_splits_transaction (transaction_id),
          CONSTRAINT fk_splits_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
          CONSTRAINT fk_splits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_splits_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS transaction_attachments (
          id CHAR(36) NOT NULL PRIMARY KEY, transaction_id CHAR(36) NULL, user_id CHAR(36) NOT NULL,
          original_name VARCHAR(255) NOT NULL, stored_name VARCHAR(255) NOT NULL, mime_type VARCHAR(100) NOT NULL,
          file_size INT NOT NULL, ocr_text TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_attachments_user (user_id), KEY idx_attachments_transaction (transaction_id),
          CONSTRAINT fk_attachments_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
          CONSTRAINT fk_attachments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];

    foreach ($tables as $sql) {
        $pdo->exec($sql);
    }
    $ready = true;
}

function productivity_log(
    PDO $pdo,
    string $userId,
    string $action,
    string $entityType,
    ?string $entityId,
    string $description,
    ?array $snapshot = null,
    bool $undoable = false
): void {
    $pdo->prepare(
        'INSERT INTO activity_log
         (id, user_id, action, entity_type, entity_id, description, snapshot_json, undoable, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        uuid_v4(), $userId, $action, $entityType, $entityId, $description,
        $snapshot ? json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
        $undoable ? 1 : 0, now_datetime(),
    ]);
}

function productivity_debt_projection(float $balance, float $annualRate, float $payment): array
{
    if ($balance <= 0) {
        return ['months' => 0, 'interest' => 0.0, 'payoffPossible' => true];
    }
    $monthlyRate = max(0, $annualRate) / 1200;
    if ($payment <= $balance * $monthlyRate) {
        return ['months' => null, 'interest' => null, 'payoffPossible' => false];
    }
    $remaining = $balance;
    $interest = 0.0;
    $months = 0;
    while ($remaining > 0.005 && $months < 1200) {
        $monthInterest = $remaining * $monthlyRate;
        $interest += $monthInterest;
        $remaining = max(0, $remaining + $monthInterest - $payment);
        $months++;
    }
    return ['months' => $months, 'interest' => round($interest, 2), 'payoffPossible' => $months < 1200];
}

