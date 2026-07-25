<?php

declare(strict_types=1);

function handle_route(array $segments, string $method): void
{
    $userId = require_login();
    if ($method === 'GET' && ($segments[0] ?? '') === 'overview') {
        reports_overview($userId);
        return;
    }
    if ($method === 'GET' && ($segments[0] ?? '') === 'export') {
        reports_export_csv($userId);
        return;
    }
    if ($method === 'GET' && ($segments[0] ?? '') === 'backup') {
        reports_backup_json($userId);
        return;
    }
    error_response('Rota de relatórios não encontrada.', 404);
}

function reports_period(): array
{
    $from = (string) ($_GET['from'] ?? (new DateTime('first day of January'))->format('Y-m-d'));
    $to = (string) ($_GET['to'] ?? (new DateTime('today'))->format('Y-m-d'));
    $fromDate = DateTime::createFromFormat('Y-m-d', $from);
    $toDate = DateTime::createFromFormat('Y-m-d', $to);
    if (!$fromDate || !$toDate || $from > $to) {
        error_response('Período inválido.', 422);
    }
    return [$from, $to];
}

function reports_overview(string $userId): void
{
    [$from, $to] = reports_period();
    $pdo = db();

    $summaryStmt = $pdo->prepare(
        "SELECT
           COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) income,
           COALESCE(ABS(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END)), 0) expense,
           COUNT(*) transaction_count
         FROM transactions
         WHERE user_id = ? AND date BETWEEN ? AND ? AND type IN ('INCOME','EXPENSE') AND status = 'CLEARED'"
    );
    $summaryStmt->execute([$userId, $from, $to]);
    $summary = $summaryStmt->fetch();
    $income = (float) $summary['income'];
    $expense = (float) $summary['expense'];

    $monthlyStmt = $pdo->prepare(
        "SELECT DATE_FORMAT(date, '%Y-%m') month,
           SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) income,
           ABS(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END)) expense
         FROM transactions
         WHERE user_id = ? AND date BETWEEN ? AND ? AND type IN ('INCOME','EXPENSE') AND status = 'CLEARED'
         GROUP BY DATE_FORMAT(date, '%Y-%m') ORDER BY month"
    );
    $monthlyStmt->execute([$userId, $from, $to]);
    $monthly = array_map(static fn($row) => [
        'month' => $row['month'],
        'income' => (float) $row['income'],
        'expense' => (float) $row['expense'],
        'net' => round((float) $row['income'] - (float) $row['expense'], 2),
    ], $monthlyStmt->fetchAll());

    $categoryStmt = $pdo->prepare(
        "SELECT COALESCE(c.name, 'Sem categoria') name, COALESCE(c.color, '#64748b') color,
           ABS(SUM(t.amount)) amount
         FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = ? AND t.type = 'EXPENSE' AND t.status = 'CLEARED' AND t.date BETWEEN ? AND ?
         GROUP BY c.id, c.name, c.color ORDER BY amount DESC LIMIT 12"
    );
    $categoryStmt->execute([$userId, $from, $to]);
    $categories = array_map(static fn($row) => [
        'categoryName' => $row['name'],
        'color' => $row['color'],
        'amount' => (float) $row['amount'],
    ], $categoryStmt->fetchAll());

    $merchantStmt = $pdo->prepare(
        "SELECT COALESCE(NULLIF(payee, ''), NULLIF(description, ''), 'Sem descrição') name,
           ABS(SUM(amount)) amount, COUNT(*) purchases
         FROM transactions
         WHERE user_id = ? AND type = 'EXPENSE' AND status = 'CLEARED' AND date BETWEEN ? AND ?
         GROUP BY name ORDER BY amount DESC LIMIT 8"
    );
    $merchantStmt->execute([$userId, $from, $to]);
    $merchants = array_map(static fn($row) => [
        'name' => $row['name'],
        'amount' => (float) $row['amount'],
        'purchases' => (int) $row['purchases'],
    ], $merchantStmt->fetchAll());

    json_response([
        'from' => $from,
        'to' => $to,
        'summary' => [
            'income' => $income,
            'expense' => $expense,
            'net' => round($income - $expense, 2),
            'savingsRate' => $income > 0 ? round((($income - $expense) / $income) * 100, 1) : 0,
            'transactionCount' => (int) $summary['transaction_count'],
        ],
        'monthly' => $monthly,
        'categories' => $categories,
        'merchants' => $merchants,
    ]);
}

function reports_export_csv(string $userId): void
{
    [$from, $to] = reports_period();
    $stmt = db()->prepare(
        "SELECT t.date, t.type, t.status, t.description, t.payee, t.amount,
           a.name account_name, c.name category_name
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = ? AND t.date BETWEEN ? AND ?
         ORDER BY t.date DESC, t.created_at DESC"
    );
    $stmt->execute([$userId, $from, $to]);

    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="financas-' . $from . '-a-' . $to . '.csv"');
    echo "\xEF\xBB\xBF";
    $out = fopen('php://output', 'wb');
    fputcsv($out, ['Data', 'Tipo', 'Status', 'Descrição', 'Beneficiário', 'Conta', 'Categoria', 'Valor'], ';');
    foreach ($stmt->fetchAll() as $row) {
        fputcsv($out, [
            $row['date'],
            $row['type'],
            $row['status'],
            reports_csv_safe($row['description']),
            reports_csv_safe($row['payee']),
            reports_csv_safe($row['account_name']),
            reports_csv_safe($row['category_name']),
            number_format((float) $row['amount'], 2, ',', ''),
        ], ';');
    }
    fclose($out);
    exit;
}

function reports_csv_safe(?string $value): string
{
    $value = (string) $value;
    return preg_match('/^[=+\-@]/', $value) ? "'" . $value : $value;
}

function reports_backup_json(string $userId): void
{
    $pdo = db();
    $profileStmt = $pdo->prepare('SELECT id, name, email, currency, theme, created_at, updated_at FROM users WHERE id = ?');
    $profileStmt->execute([$userId]);

    $tables = [
        'accounts',
        'categories',
        'tags',
        'transactions',
        'category_rules',
        'budgets',
        'recurring_transactions',
        'goals',
        'credit_card_invoices',
    ];
    $backup = [
        'format' => 'financas-backup',
        'version' => 1,
        'exportedAt' => (new DateTime())->format(DateTime::ATOM),
        'user' => $profileStmt->fetch(),
        'data' => [],
    ];
    foreach ($tables as $table) {
        $stmt = $pdo->prepare("SELECT * FROM `$table` WHERE user_id = ?");
        $stmt->execute([$userId]);
        $backup['data'][$table] = $stmt->fetchAll();
    }
    $tagStmt = $pdo->prepare(
        'SELECT tt.* FROM transaction_tags tt
         JOIN transactions t ON t.id = tt.transaction_id WHERE t.user_id = ?'
    );
    $tagStmt->execute([$userId]);
    $backup['data']['transaction_tags'] = $tagStmt->fetchAll();

    header('Content-Type: application/json; charset=UTF-8');
    header('Content-Disposition: attachment; filename="financas-backup-' . (new DateTime())->format('Y-m-d') . '.json"');
    echo json_encode($backup, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}
