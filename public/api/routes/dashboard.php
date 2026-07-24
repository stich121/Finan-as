<?php

declare(strict_types=1);

function handle_route(array $segments, string $method): void
{
    $userId = require_login();

    if ($method !== 'GET') {
        error_response('Método não permitido.', 405);
    }

    if (($segments[0] ?? '') === 'summary') {
        dashboard_summary($userId);
        return;
    }
    if (($segments[0] ?? '') === 'trend') {
        dashboard_trend($userId);
        return;
    }

    error_response('Rota de dashboard não encontrada.', 404);
}

function dashboard_summary(string $userId): void
{
    $month = (string) ($_GET['month'] ?? (new DateTime('now'))->format('Y-m'));
    if (!month_string_valid($month)) {
        error_response('Parâmetro "month" inválido (use YYYY-MM).', 422);
    }

    $pdo = db();

    $balanceStmt = $pdo->prepare('SELECT COALESCE(SUM(balance), 0) FROM accounts WHERE user_id = ? AND archived = 0');
    $balanceStmt->execute([$userId]);
    $totalBalance = (float) $balanceStmt->fetchColumn();

    $incomeStmt = $pdo->prepare(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = ? AND type = 'INCOME' AND DATE_FORMAT(date, '%Y-%m') = ?"
    );
    $incomeStmt->execute([$userId, $month]);
    $income = (float) $incomeStmt->fetchColumn();

    $expenseStmt = $pdo->prepare(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND DATE_FORMAT(date, '%Y-%m') = ?"
    );
    $expenseStmt->execute([$userId, $month]);
    $expense = abs((float) $expenseStmt->fetchColumn());

    $byCategoryStmt = $pdo->prepare(
        "SELECT c.id, c.name, c.color, SUM(t.amount) AS total FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = ? AND t.type = 'EXPENSE' AND DATE_FORMAT(t.date, '%Y-%m') = ?
         GROUP BY c.id, c.name, c.color ORDER BY total ASC"
    );
    $byCategoryStmt->execute([$userId, $month]);
    $spendingByCategory = array_map(function ($row) {
        return [
            'categoryId' => $row['id'],
            'categoryName' => $row['name'],
            'color' => $row['color'],
            'amount' => abs((float) $row['total']),
        ];
    }, $byCategoryStmt->fetchAll());

    json_response([
        'month' => $month,
        'totalBalance' => $totalBalance,
        'income' => $income,
        'expense' => $expense,
        'net' => round($income - $expense, 2),
        'spendingByCategory' => $spendingByCategory,
    ]);
}

function dashboard_trend(string $userId): void
{
    $months = max(1, min(24, (int) ($_GET['months'] ?? 6)));
    $pdo = db();

    $result = [];
    $cursor = new DateTime('first day of this month');
    $points = [];
    for ($i = $months - 1; $i >= 0; $i--) {
        $d = clone $cursor;
        $d->modify("-$i months");
        $points[] = $d->format('Y-m');
    }

    $stmt = $pdo->prepare(
        "SELECT DATE_FORMAT(date, '%Y-%m') AS ym, type, SUM(amount) AS total FROM transactions
         WHERE user_id = ? AND type IN ('INCOME','EXPENSE') AND date >= ?
         GROUP BY ym, type"
    );
    $startDate = (clone $cursor)->modify('-' . ($months - 1) . ' months')->format('Y-m-01');
    $stmt->execute([$userId, $startDate]);

    $byMonth = [];
    foreach ($stmt->fetchAll() as $row) {
        $byMonth[$row['ym']][$row['type']] = (float) $row['total'];
    }

    foreach ($points as $ym) {
        $income = $byMonth[$ym]['INCOME'] ?? 0.0;
        $expense = abs($byMonth[$ym]['EXPENSE'] ?? 0.0);
        $result[] = [
            'month' => $ym,
            'income' => $income,
            'expense' => $expense,
            'net' => round($income - $expense, 2),
        ];
    }

    json_response($result);
}
