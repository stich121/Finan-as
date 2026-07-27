<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/productivity.php';

function handle_route(array $segments, string $method): void
{
    $userId = require_login();
    $pdo = db();
    productivity_ensure_schema($pdo);
    $resource = $segments[0] ?? 'overview';

    if ($resource === 'overview' && $method === 'GET') {
        productivity_overview($pdo, $userId);
        return;
    }
    if ($resource === 'tax-report' && $method === 'GET') {
        productivity_tax_report($pdo, $userId);
        return;
    }
    if ($resource === 'attachment' && count($segments) === 2 && $method === 'GET') {
        productivity_attachment_download($pdo, $userId, $segments[1]);
        return;
    }

    if ($method !== 'GET') {
        require_csrf();
    }
    if ($resource === 'reconcile' && $method === 'POST') {
        productivity_reconcile($pdo, $userId);
        return;
    }
    if ($resource === 'debts' && $method === 'POST') {
        productivity_debt_create($pdo, $userId);
        return;
    }
    if ($resource === 'debts' && count($segments) === 2 && $method === 'PATCH') {
        productivity_debt_update($pdo, $userId, $segments[1]);
        return;
    }
    if ($resource === 'shared-expenses' && $method === 'POST') {
        productivity_shared_expense_create($pdo, $userId);
        return;
    }
    if ($resource === 'shared-expenses' && count($segments) === 2 && $method === 'PATCH') {
        productivity_shared_expense_update($pdo, $userId, $segments[1]);
        return;
    }
    if ($resource === 'wallets' && $method === 'POST') {
        productivity_wallet_create($pdo, $userId);
        return;
    }
    if ($resource === 'wallet-entries' && $method === 'POST') {
        productivity_wallet_entry_create($pdo, $userId);
        return;
    }
    if ($resource === 'closing' && $method === 'POST') {
        productivity_closing_save($pdo, $userId);
        return;
    }
    if ($resource === 'splits' && $method === 'POST') {
        productivity_split_save($pdo, $userId);
        return;
    }
    if ($resource === 'attachments' && $method === 'POST') {
        productivity_attachment_save($pdo, $userId);
        return;
    }
    if ($resource === 'undo' && count($segments) === 2 && $method === 'POST') {
        productivity_undo($pdo, $userId, $segments[1]);
        return;
    }

    error_response('Rota de planejamento não encontrada.', 404);
}

function productivity_overview(PDO $pdo, string $userId): void
{
    $month = preg_match('/^\d{4}-\d{2}$/', (string) ($_GET['month'] ?? '')) ? $_GET['month'] : date('Y-m');
    $monthStart = $month . '-01';
    $monthEnd = (new DateTime($monthStart))->modify('last day of this month')->format('Y-m-d');
    $previousStart = (new DateTime($monthStart))->modify('-1 month')->format('Y-m-01');
    $previousEnd = (new DateTime($monthStart))->modify('-1 day')->format('Y-m-d');
    $today = date('Y-m-d');
    $futureEnd = (new DateTime('today'))->modify('+90 days')->format('Y-m-d');

    $accountStmt = $pdo->prepare(
        "SELECT a.*,
          (SELECT reconciled_at FROM account_reconciliations r WHERE r.account_id = a.id ORDER BY reconciled_at DESC LIMIT 1) last_reconciled_at,
          (SELECT difference FROM account_reconciliations r WHERE r.account_id = a.id ORDER BY reconciled_at DESC LIMIT 1) last_difference
         FROM accounts a WHERE a.user_id = ? AND a.archived = 0 ORDER BY a.name"
    );
    $accountStmt->execute([$userId]);
    $accounts = array_map(static fn(array $row): array => [
        'id' => $row['id'], 'name' => $row['name'], 'type' => $row['type'],
        'balance' => (float) $row['balance'], 'color' => $row['color'],
        'lastReconciledAt' => $row['last_reconciled_at'],
        'lastDifference' => $row['last_difference'] !== null ? (float) $row['last_difference'] : null,
    ], $accountStmt->fetchAll());

    $calendar = [];
    $txStmt = $pdo->prepare(
        "SELECT id, date, type, amount, description, payee, status FROM transactions
         WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date LIMIT 300"
    );
    $txStmt->execute([$userId, $today, $futureEnd]);
    foreach ($txStmt->fetchAll() as $row) {
        $calendar[] = [
            'id' => $row['id'], 'date' => $row['date'], 'kind' => strtolower($row['type']),
            'title' => $row['description'] ?: ($row['payee'] ?: 'Lançamento'),
            'amount' => (float) $row['amount'], 'status' => $row['status'],
        ];
    }
    $recStmt = $pdo->prepare(
        "SELECT id, next_run_date, type, amount, description, frequency, end_date FROM recurring_transactions
         WHERE user_id = ? AND next_run_date BETWEEN ? AND ? ORDER BY next_run_date"
    );
    $recStmt->execute([$userId, $today, $futureEnd]);
    foreach ($recStmt->fetchAll() as $row) {
        $occurrence = new DateTime($row['next_run_date']);
        $lastAllowed = $row['end_date'] ? min($futureEnd, $row['end_date']) : $futureEnd;
        $step = match ($row['frequency']) {
            'WEEKLY' => '+1 week',
            'BIWEEKLY' => '+2 weeks',
            'YEARLY' => '+1 year',
            default => '+1 month',
        };
        while ($occurrence->format('Y-m-d') <= $lastAllowed) {
            $calendar[] = [
                'id' => $row['id'], 'date' => $occurrence->format('Y-m-d'), 'kind' => 'recurring',
                'title' => $row['description'], 'amount' => $row['type'] === 'EXPENSE' ? -(float) $row['amount'] : (float) $row['amount'],
                'status' => 'SCHEDULED',
            ];
            $occurrence->modify($step);
        }
    }
    $invoiceStmt = $pdo->prepare(
        "SELECT i.id, i.due_date, i.status, a.name,
          COALESCE((SELECT ABS(SUM(t.amount)) FROM transactions t WHERE t.invoice_id = i.id AND t.type = 'EXPENSE'), 0) - i.paid_amount amount
         FROM credit_card_invoices i JOIN accounts a ON a.id = i.account_id
         WHERE i.user_id = ? AND i.due_date BETWEEN ? AND ? AND i.status <> 'PAID'"
    );
    $invoiceStmt->execute([$userId, $today, $futureEnd]);
    foreach ($invoiceStmt->fetchAll() as $row) {
        $calendar[] = [
            'id' => $row['id'], 'date' => $row['due_date'], 'kind' => 'invoice',
            'title' => 'Fatura ' . $row['name'], 'amount' => -(float) $row['amount'], 'status' => $row['status'],
        ];
    }
    $debtsStmt = $pdo->prepare("SELECT * FROM debts WHERE user_id = ? ORDER BY status, balance DESC");
    $debtsStmt->execute([$userId]);
    $debts = array_map(static function (array $row): array {
        $projection = productivity_debt_projection(
            (float) $row['balance'], (float) $row['annual_rate'], (float) $row['minimum_payment']
        );
        return [
            'id' => $row['id'], 'name' => $row['name'], 'balance' => (float) $row['balance'],
            'annualRate' => (float) $row['annual_rate'], 'minimumPayment' => (float) $row['minimum_payment'],
            'dueDay' => $row['due_day'] ? (int) $row['due_day'] : null, 'status' => $row['status'],
            'projection' => $projection,
        ];
    }, $debtsStmt->fetchAll());
    foreach ($debts as $debt) {
        if ($debt['status'] !== 'ACTIVE' || !$debt['dueDay']) {
            continue;
        }
        $due = new DateTime(date('Y-m-') . str_pad((string) $debt['dueDay'], 2, '0', STR_PAD_LEFT));
        if ($due < new DateTime('today')) {
            $due->modify('+1 month');
        }
        while ($due->format('Y-m-d') <= $futureEnd) {
            $calendar[] = [
                'id' => $debt['id'], 'date' => $due->format('Y-m-d'), 'kind' => 'debt',
                'title' => 'Parcela · ' . $debt['name'], 'amount' => -$debt['minimumPayment'], 'status' => 'SCHEDULED',
            ];
            $due->modify('+1 month');
        }
    }
    usort($calendar, static fn(array $a, array $b): int => strcmp($a['date'], $b['date']));

    $subscriptions = productivity_detect_subscriptions($pdo, $userId);
    $cashflow = productivity_cashflow($accounts, $calendar);
    $insights = productivity_insights($pdo, $userId, $monthStart, $monthEnd, $previousStart, $previousEnd);

    $assets = 0.0;
    $liabilities = 0.0;
    foreach ($accounts as $account) {
        if ($account['type'] === 'CREDIT_CARD' || $account['balance'] < 0) {
            $liabilities += abs(min(0, $account['balance']));
        } else {
            $assets += $account['balance'];
        }
    }
    foreach ($debts as $debt) {
        if ($debt['status'] === 'ACTIVE') {
            $liabilities += $debt['balance'];
        }
    }
    $netWorth = round($assets - $liabilities, 2);
    $pdo->prepare(
        "INSERT INTO financial_snapshots (id, user_id, snapshot_date, net_worth, assets, liabilities, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE net_worth = VALUES(net_worth), assets = VALUES(assets), liabilities = VALUES(liabilities)"
    )->execute([uuid_v4(), $userId, $today, $netWorth, $assets, $liabilities, now_datetime()]);
    $snapshotStmt = $pdo->prepare(
        'SELECT snapshot_date date, net_worth netWorth, assets, liabilities FROM financial_snapshots
         WHERE user_id = ? ORDER BY snapshot_date ASC LIMIT 366'
    );
    $snapshotStmt->execute([$userId]);
    $snapshots = array_map(static fn(array $r): array => [
        'date' => $r['date'], 'netWorth' => (float) $r['netWorth'],
        'assets' => (float) $r['assets'], 'liabilities' => (float) $r['liabilities'],
    ], $snapshotStmt->fetchAll());

    $closingStmt = $pdo->prepare('SELECT * FROM monthly_closings WHERE user_id = ? AND BINARY month = BINARY ?');
    $closingStmt->execute([$userId, $month]);
    $closingRow = $closingStmt->fetch();
    $defaultChecklist = [
        ['key' => 'reconcile', 'label' => 'Conferir saldos das contas', 'done' => false],
        ['key' => 'categorize', 'label' => 'Categorizar lançamentos pendentes', 'done' => false],
        ['key' => 'invoices', 'label' => 'Revisar e pagar faturas', 'done' => false],
        ['key' => 'budgets', 'label' => 'Comparar gastos com orçamentos', 'done' => false],
        ['key' => 'backup', 'label' => 'Gerar backup mensal', 'done' => false],
    ];
    $closing = [
        'month' => $month,
        'checklist' => $closingRow ? (json_decode($closingRow['checklist_json'], true) ?: $defaultChecklist) : $defaultChecklist,
        'closedAt' => $closingRow['closed_at'] ?? null,
    ];

    $sharedStmt = $pdo->prepare('SELECT * FROM shared_expenses WHERE user_id = ? ORDER BY status, due_date, created_at DESC');
    $sharedStmt->execute([$userId]);
    $sharedExpenses = array_map(static fn(array $r): array => [
        'id' => $r['id'], 'description' => $r['description'], 'personName' => $r['person_name'],
        'personEmail' => $r['person_email'], 'totalAmount' => (float) $r['total_amount'],
        'personAmount' => (float) $r['person_amount'], 'dueDate' => $r['due_date'], 'status' => $r['status'],
    ], $sharedStmt->fetchAll());

    $walletStmt = $pdo->prepare(
        "SELECT w.*, (SELECT COALESCE(SUM(e.amount), 0) FROM shared_wallet_entries e WHERE e.wallet_id = w.id) total
         FROM shared_wallets w
         WHERE w.user_id = ? OR LOWER(w.member_email) = LOWER((SELECT email FROM users WHERE id = ?))
         ORDER BY w.created_at DESC"
    );
    $walletStmt->execute([$userId, $userId]);
    $wallets = array_map(static fn(array $r): array => [
        'id' => $r['id'], 'name' => $r['name'], 'memberName' => $r['member_name'],
        'memberEmail' => $r['member_email'], 'total' => (float) $r['total'],
    ], $walletStmt->fetchAll());

    $activityStmt = $pdo->prepare(
        'SELECT id, action, entity_type entityType, entity_id entityId, description, undoable, undone_at undoneAt, created_at createdAt
         FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 30'
    );
    $activityStmt->execute([$userId]);

    $attachmentStmt = $pdo->prepare(
        'SELECT id, transaction_id transactionId, original_name originalName, mime_type mimeType,
          file_size fileSize, ocr_text ocrText, created_at createdAt
         FROM transaction_attachments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
    );
    $attachmentStmt->execute([$userId]);

    json_response([
        'month' => $month, 'accounts' => $accounts, 'calendar' => $calendar, 'cashflow' => $cashflow,
        'subscriptions' => $subscriptions, 'debts' => $debts, 'closing' => $closing,
        'sharedExpenses' => $sharedExpenses, 'wallets' => $wallets, 'insights' => $insights,
        'netWorth' => ['current' => $netWorth, 'assets' => round($assets, 2), 'liabilities' => round($liabilities, 2), 'history' => $snapshots],
        'activity' => array_map(static fn(array $r): array => [
            ...$r, 'undoable' => (bool) $r['undoable'],
        ], $activityStmt->fetchAll()),
        'attachments' => $attachmentStmt->fetchAll(),
    ]);
}

function productivity_detect_subscriptions(PDO $pdo, string $userId): array
{
    $stmt = $pdo->prepare(
        "SELECT date, ABS(amount) amount, COALESCE(NULLIF(payee,''), NULLIF(description,''), '') merchant
         FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND status = 'CLEARED'
         AND date >= DATE_SUB(CURDATE(), INTERVAL 8 MONTH) ORDER BY date"
    );
    $stmt->execute([$userId]);
    $groups = [];
    foreach ($stmt->fetchAll() as $row) {
        $key = mb_strtolower(trim((string) $row['merchant']));
        $key = preg_replace('/\s+/', ' ', preg_replace('/\d+/', '', $key));
        if (mb_strlen($key) < 3) {
            continue;
        }
        $groups[$key][] = ['date' => $row['date'], 'amount' => (float) $row['amount'], 'name' => $row['merchant']];
    }
    $result = [];
    foreach ($groups as $rows) {
        if (count($rows) < 2) {
            continue;
        }
        $amounts = array_column($rows, 'amount');
        $average = array_sum($amounts) / count($amounts);
        $variance = $average > 0 ? (max($amounts) - min($amounts)) / $average : 1;
        $days = (strtotime(end($rows)['date']) - strtotime($rows[0]['date'])) / 86400;
        if ($days < 20 || $variance > 0.25) {
            continue;
        }
        $result[] = [
            'merchant' => end($rows)['name'], 'averageAmount' => round($average, 2),
            'occurrences' => count($rows), 'lastDate' => end($rows)['date'],
            'confidence' => min(99, 55 + count($rows) * 10),
        ];
    }
    usort($result, static fn(array $a, array $b): int => $b['confidence'] <=> $a['confidence']);
    return array_slice($result, 0, 12);
}

function productivity_cashflow(array $accounts, array $calendar): array
{
    $balance = 0.0;
    foreach ($accounts as $account) {
        if ($account['type'] !== 'CREDIT_CARD') {
            $balance += $account['balance'];
        }
    }
    $periods = [30 => $balance, 60 => $balance, 90 => $balance];
    $today = new DateTime('today');
    foreach ($calendar as $event) {
        $days = (int) $today->diff(new DateTime($event['date']))->format('%r%a');
        foreach ([30, 60, 90] as $period) {
            if ($days <= $period) {
                $periods[$period] += (float) $event['amount'];
            }
        }
    }
    return [
        'startingBalance' => round($balance, 2),
        'days30' => round($periods[30], 2),
        'days60' => round($periods[60], 2),
        'days90' => round($periods[90], 2),
    ];
}

function productivity_insights(
    PDO $pdo,
    string $userId,
    string $monthStart,
    string $monthEnd,
    string $previousStart,
    string $previousEnd
): array {
    $summarySql = "SELECT
      COALESCE(SUM(CASE WHEN type='INCOME' THEN amount ELSE 0 END),0) income,
      COALESCE(SUM(CASE WHEN type='EXPENSE' THEN ABS(amount) ELSE 0 END),0) expense
      FROM transactions WHERE user_id=? AND status='CLEARED' AND date BETWEEN ? AND ?";
    $stmt = $pdo->prepare($summarySql);
    $stmt->execute([$userId, $monthStart, $monthEnd]);
    $current = $stmt->fetch();
    $stmt->execute([$userId, $previousStart, $previousEnd]);
    $previous = $stmt->fetch();

    $heatStmt = $pdo->prepare(
        "SELECT DAY(date) day, ABS(SUM(amount)) amount FROM transactions
         WHERE user_id=? AND type='EXPENSE' AND status='CLEARED' AND date BETWEEN ? AND ?
         GROUP BY DAY(date) ORDER BY day"
    );
    $heatStmt->execute([$userId, $monthStart, $monthEnd]);

    $merchantStmt = $pdo->prepare(
        "SELECT COALESCE(NULLIF(payee,''), NULLIF(description,''), 'Sem descrição') name,
          ABS(SUM(amount)) amount, COUNT(*) purchases
         FROM transactions WHERE user_id=? AND type='EXPENSE' AND status='CLEARED' AND date BETWEEN ? AND ?
         GROUP BY name ORDER BY amount DESC LIMIT 10"
    );
    $merchantStmt->execute([$userId, $monthStart, $monthEnd]);

    $essentialStmt = $pdo->prepare(
        "SELECT COALESCE(SUM(CASE WHEN COALESCE(c.is_essential,0)=1 THEN ABS(t.amount) ELSE 0 END),0) essential,
          COALESCE(SUM(CASE WHEN COALESCE(c.is_essential,0)=0 THEN ABS(t.amount) ELSE 0 END),0) nonessential
         FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
         WHERE t.user_id=? AND t.type='EXPENSE' AND t.status='CLEARED' AND t.date BETWEEN ? AND ?"
    );
    $essentialStmt->execute([$userId, $monthStart, $monthEnd]);
    $essential = $essentialStmt->fetch();

    return [
        'current' => ['income' => (float) $current['income'], 'expense' => (float) $current['expense']],
        'previous' => ['income' => (float) $previous['income'], 'expense' => (float) $previous['expense']],
        'heatmap' => array_map(static fn(array $r): array => ['day' => (int) $r['day'], 'amount' => (float) $r['amount']], $heatStmt->fetchAll()),
        'merchants' => array_map(static fn(array $r): array => ['name' => $r['name'], 'amount' => (float) $r['amount'], 'purchases' => (int) $r['purchases']], $merchantStmt->fetchAll()),
        'essential' => ['essential' => (float) $essential['essential'], 'nonessential' => (float) $essential['nonessential']],
    ];
}

function productivity_reconcile(PDO $pdo, string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['accountId', 'statementBalance']);
    $stmt = $pdo->prepare('SELECT id, name, balance FROM accounts WHERE id=? AND user_id=?');
    $stmt->execute([$data['accountId'], $userId]);
    $account = $stmt->fetch();
    if (!$account) {
        error_response('Conta não encontrada.', 404);
    }
    $statementBalance = decimal_amount($data['statementBalance']);
    $difference = round($statementBalance - (float) $account['balance'], 2);
    $id = uuid_v4();
    $pdo->prepare(
        'INSERT INTO account_reconciliations
         (id,user_id,account_id,statement_balance,app_balance,difference,reconciled_at,note)
         VALUES (?,?,?,?,?,?,?,?)'
    )->execute([$id, $userId, $account['id'], $statementBalance, $account['balance'], $difference, now_datetime(), $data['note'] ?? null]);
    productivity_log($pdo, $userId, 'RECONCILE', 'account', $account['id'], 'Conta "' . $account['name'] . '" conciliada.');
    json_response(['id' => $id, 'difference' => $difference], 201);
}

function productivity_debt_create(PDO $pdo, string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['name', 'balance', 'minimumPayment']);
    $id = uuid_v4();
    $row = [
        'id' => $id, 'name' => trim((string) $data['name']),
        'balance' => decimal_amount($data['balance']),
        'annualRate' => max(0, (float) ($data['annualRate'] ?? 0)),
        'minimumPayment' => decimal_amount($data['minimumPayment']),
        'dueDay' => isset($data['dueDay']) ? min(28, max(1, (int) $data['dueDay'])) : null,
    ];
    $pdo->prepare(
        'INSERT INTO debts (id,user_id,name,balance,annual_rate,minimum_payment,due_day,status,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,"ACTIVE",?,?)'
    )->execute([$id, $userId, $row['name'], $row['balance'], $row['annualRate'], $row['minimumPayment'], $row['dueDay'], now_datetime(), now_datetime()]);
    productivity_log($pdo, $userId, 'CREATE', 'debt', $id, 'Dívida "' . $row['name'] . '" criada.', $row, true);
    json_response(['id' => $id], 201);
}

function productivity_debt_update(PDO $pdo, string $userId, string $id): void
{
    $data = read_json_body();
    $stmt = $pdo->prepare('SELECT * FROM debts WHERE id=? AND user_id=?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        error_response('Dívida não encontrada.', 404);
    }
    $status = ($data['status'] ?? $row['status']) === 'PAID' ? 'PAID' : 'ACTIVE';
    $balance = array_key_exists('balance', $data) ? decimal_amount($data['balance']) : (float) $row['balance'];
    $pdo->prepare('UPDATE debts SET balance=?, status=?, updated_at=? WHERE id=? AND user_id=?')
        ->execute([$balance, $status, now_datetime(), $id, $userId]);
    productivity_log($pdo, $userId, 'UPDATE', 'debt', $id, 'Dívida "' . $row['name'] . '" atualizada.');
    json_response(['ok' => true]);
}

function productivity_shared_expense_create(PDO $pdo, string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['description', 'personName', 'totalAmount', 'personAmount']);
    $id = uuid_v4();
    $pdo->prepare(
        'INSERT INTO shared_expenses
         (id,user_id,description,person_name,person_email,total_amount,person_amount,due_date,status,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,\'PENDING\',?,?)'
    )->execute([
        $id, $userId, trim((string) $data['description']), trim((string) $data['personName']),
        $data['personEmail'] ?? null, decimal_amount($data['totalAmount']), decimal_amount($data['personAmount']),
        $data['dueDate'] ?? null, now_datetime(), now_datetime(),
    ]);
    productivity_log($pdo, $userId, 'CREATE', 'shared_expense', $id, 'Despesa dividida com ' . trim((string) $data['personName']) . '.', $data, true);
    json_response(['id' => $id], 201);
}

function productivity_shared_expense_update(PDO $pdo, string $userId, string $id): void
{
    $data = read_json_body();
    $status = ($data['status'] ?? '') === 'PAID' ? 'PAID' : 'PENDING';
    $stmt = $pdo->prepare('UPDATE shared_expenses SET status=?, updated_at=? WHERE id=? AND user_id=?');
    $stmt->execute([$status, now_datetime(), $id, $userId]);
    if ($stmt->rowCount() === 0) {
        error_response('Despesa compartilhada não encontrada.', 404);
    }
    productivity_log($pdo, $userId, 'UPDATE', 'shared_expense', $id, 'Situação da despesa compartilhada atualizada.');
    json_response(['ok' => true]);
}

function productivity_wallet_create(PDO $pdo, string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['name']);
    $id = uuid_v4();
    $pdo->prepare('INSERT INTO shared_wallets (id,user_id,name,member_name,member_email,created_at) VALUES (?,?,?,?,?,?)')
        ->execute([$id, $userId, trim((string) $data['name']), $data['memberName'] ?? null, $data['memberEmail'] ?? null, now_datetime()]);
    productivity_log($pdo, $userId, 'CREATE', 'wallet', $id, 'Carteira compartilhada "' . trim((string) $data['name']) . '" criada.', $data, true);
    json_response(['id' => $id], 201);
}

function productivity_wallet_entry_create(PDO $pdo, string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['walletId', 'description', 'amount', 'entryDate']);
    $check = $pdo->prepare(
        'SELECT id FROM shared_wallets WHERE id=? AND
         (user_id=? OR LOWER(member_email)=LOWER((SELECT email FROM users WHERE id=?)))'
    );
    $check->execute([$data['walletId'], $userId, $userId]);
    if (!$check->fetch()) {
        error_response('Carteira não encontrada.', 404);
    }
    $id = uuid_v4();
    $pdo->prepare(
        'INSERT INTO shared_wallet_entries (id,wallet_id,user_id,description,amount,paid_by,entry_date,created_at)
         VALUES (?,?,?,?,?,?,?,?)'
    )->execute([$id, $data['walletId'], $userId, trim((string) $data['description']), decimal_amount($data['amount']), $data['paidBy'] ?? null, $data['entryDate'], now_datetime()]);
    productivity_log($pdo, $userId, 'CREATE', 'wallet_entry', $id, 'Lançamento adicionado à carteira compartilhada.', $data, true);
    json_response(['id' => $id], 201);
}

function productivity_closing_save(PDO $pdo, string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['month', 'checklist']);
    if (!preg_match('/^\d{4}-\d{2}$/', (string) $data['month']) || !is_array($data['checklist'])) {
        error_response('Fechamento inválido.', 422);
    }
    $allDone = count($data['checklist']) > 0 && count(array_filter($data['checklist'], static fn($item) => !empty($item['done']))) === count($data['checklist']);
    $pdo->prepare(
        'INSERT INTO monthly_closings (id,user_id,month,checklist_json,closed_at,updated_at)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE checklist_json=VALUES(checklist_json),closed_at=VALUES(closed_at),updated_at=VALUES(updated_at)'
    )->execute([
        uuid_v4(), $userId, $data['month'],
        json_encode($data['checklist'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $allDone ? now_datetime() : null, now_datetime(),
    ]);
    productivity_log($pdo, $userId, 'UPDATE', 'monthly_closing', null, 'Checklist de fechamento de ' . $data['month'] . ' atualizado.');
    json_response(['closed' => $allDone]);
}

function productivity_split_save(PDO $pdo, string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['transactionId', 'items']);
    $stmt = $pdo->prepare('SELECT id, amount FROM transactions WHERE id=? AND user_id=?');
    $stmt->execute([$data['transactionId'], $userId]);
    $transaction = $stmt->fetch();
    if (!$transaction || !is_array($data['items']) || count($data['items']) < 2) {
        error_response('Informe uma transação válida e ao menos duas divisões.', 422);
    }
    $total = 0.0;
    foreach ($data['items'] as $item) {
        $total += decimal_amount($item['amount'] ?? 0);
    }
    if (abs($total - abs((float) $transaction['amount'])) > 0.01) {
        error_response('A soma das divisões deve ser igual ao valor da transação.', 422);
    }
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM transaction_splits WHERE transaction_id=? AND user_id=?')->execute([$transaction['id'], $userId]);
        $insert = $pdo->prepare(
            'INSERT INTO transaction_splits (id,transaction_id,user_id,category_id,amount,note,created_at)
             VALUES (?,?,?,?,?,?,?)'
        );
        foreach ($data['items'] as $item) {
            $insert->execute([uuid_v4(), $transaction['id'], $userId, $item['categoryId'] ?: null, decimal_amount($item['amount']), $item['note'] ?? null, now_datetime()]);
        }
        productivity_log($pdo, $userId, 'UPDATE', 'transaction_split', $transaction['id'], 'Compra dividida entre ' . count($data['items']) . ' categorias.');
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    json_response(['ok' => true]);
}

function productivity_attachment_save(PDO $pdo, string $userId): void
{
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        error_response('Selecione uma imagem ou PDF válido.', 422);
    }
    $file = $_FILES['file'];
    if ((int) $file['size'] > 5 * 1024 * 1024) {
        error_response('O arquivo deve ter no máximo 5 MB.', 422);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: '';
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];
    if (!isset($extensions[$mime])) {
        error_response('Formato não permitido. Use JPG, PNG, WEBP ou PDF.', 422);
    }
    $transactionId = $_POST['transactionId'] ?? null;
    if ($transactionId) {
        $check = $pdo->prepare('SELECT id FROM transactions WHERE id=? AND user_id=?');
        $check->execute([$transactionId, $userId]);
        if (!$check->fetch()) {
            error_response('Transação não encontrada.', 404);
        }
    }
    $storage = __DIR__ . '/../storage/receipts';
    if (!is_dir($storage) && !mkdir($storage, 0750, true) && !is_dir($storage)) {
        error_response('Não foi possível preparar o armazenamento.', 500);
    }
    $storedName = bin2hex(random_bytes(20)) . '.' . $extensions[$mime];
    if (!move_uploaded_file($file['tmp_name'], $storage . '/' . $storedName)) {
        error_response('Não foi possível salvar o comprovante.', 500);
    }
    $id = uuid_v4();
    $originalName = mb_substr(basename((string) $file['name']), 0, 255);
    $ocrText = isset($_POST['ocrText']) ? mb_substr((string) $_POST['ocrText'], 0, 20000) : null;
    $pdo->prepare(
        'INSERT INTO transaction_attachments
         (id,transaction_id,user_id,original_name,stored_name,mime_type,file_size,ocr_text,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)'
    )->execute([$id, $transactionId ?: null, $userId, $originalName, $storedName, $mime, $file['size'], $ocrText, now_datetime()]);
    productivity_log($pdo, $userId, 'CREATE', 'attachment', $id, 'Comprovante "' . $originalName . '" anexado.', null, true);
    json_response(['id' => $id, 'originalName' => $originalName], 201);
}

function productivity_attachment_download(PDO $pdo, string $userId, string $id): void
{
    $stmt = $pdo->prepare('SELECT * FROM transaction_attachments WHERE id=? AND user_id=?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        error_response('Comprovante não encontrado.', 404);
    }
    $path = __DIR__ . '/../storage/receipts/' . basename($row['stored_name']);
    if (!is_file($path)) {
        error_response('Arquivo indisponível.', 404);
    }
    header('Content-Type: ' . $row['mime_type']);
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: inline; filename="' . rawurlencode($row['original_name']) . '"');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

function productivity_undo(PDO $pdo, string $userId, string $logId): void
{
    $stmt = $pdo->prepare('SELECT * FROM activity_log WHERE id=? AND user_id=? AND undoable=1 AND undone_at IS NULL');
    $stmt->execute([$logId, $userId]);
    $log = $stmt->fetch();
    if (!$log) {
        error_response('Esta alteração não pode mais ser desfeita.', 422);
    }
    $map = [
        'debt' => ['debts', 'id'],
        'shared_expense' => ['shared_expenses', 'id'],
        'wallet' => ['shared_wallets', 'id'],
        'wallet_entry' => ['shared_wallet_entries', 'id'],
        'attachment' => ['transaction_attachments', 'id'],
    ];
    if (!isset($map[$log['entity_type']])) {
        error_response('Desfazer não é compatível com esta alteração.', 422);
    }
    [$table, $column] = $map[$log['entity_type']];
    $pdo->prepare("DELETE FROM `$table` WHERE `$column`=? AND user_id=?")->execute([$log['entity_id'], $userId]);
    $pdo->prepare('UPDATE activity_log SET undone_at=? WHERE id=?')->execute([now_datetime(), $logId]);
    json_response(['ok' => true]);
}

function productivity_tax_report(PDO $pdo, string $userId): void
{
    $year = preg_match('/^\d{4}$/', (string) ($_GET['year'] ?? '')) ? $_GET['year'] : date('Y');
    $from = $year . '-01-01';
    $to = $year . '-12-31';
    $stmt = $pdo->prepare(
        "SELECT t.date, t.description, t.payee, t.amount, a.name account_name,
          c.name category_name, c.is_essential
         FROM transactions t JOIN accounts a ON a.id=t.account_id
         LEFT JOIN categories c ON c.id=t.category_id
         WHERE t.user_id=? AND t.status='CLEARED' AND t.date BETWEEN ? AND ?
         ORDER BY t.date"
    );
    $stmt->execute([$userId, $from, $to]);
    $rows = $stmt->fetchAll();
    $income = 0.0;
    $expense = 0.0;
    foreach ($rows as &$row) {
        $row['amount'] = (float) $row['amount'];
        if ($row['amount'] >= 0) {
            $income += $row['amount'];
        } else {
            $expense += abs($row['amount']);
        }
        $row['is_essential'] = (bool) $row['is_essential'];
    }
    json_response(['year' => $year, 'income' => round($income, 2), 'expense' => round($expense, 2), 'transactions' => $rows]);
}
