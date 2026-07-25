<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/finance.php';

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
    if (($segments[0] ?? '') === 'forecast') {
        dashboard_forecast($userId);
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

    refresh_invoice_statuses($pdo, $userId);

    $balanceStmt = $pdo->prepare("SELECT COALESCE(SUM(balance), 0) FROM accounts WHERE user_id = ? AND archived = 0 AND type <> 'CREDIT_CARD'");
    $balanceStmt->execute([$userId]);
    $availableBalance = (float) $balanceStmt->fetchColumn();

    $debtStmt = $pdo->prepare("SELECT COALESCE(ABS(SUM(LEAST(balance, 0))), 0) FROM accounts WHERE user_id = ? AND archived = 0 AND type = 'CREDIT_CARD'");
    $debtStmt->execute([$userId]);
    $creditCardDebt = (float) $debtStmt->fetchColumn();
    $netWorth = round($availableBalance - $creditCardDebt, 2);

    $incomeStmt = $pdo->prepare(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = ? AND type = 'INCOME' AND status = 'CLEARED' AND DATE_FORMAT(date, '%Y-%m') = ?"
    );
    $incomeStmt->execute([$userId, $month]);
    $income = (float) $incomeStmt->fetchColumn();

    $expenseStmt = $pdo->prepare(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = ? AND type = 'EXPENSE' AND status = 'CLEARED' AND DATE_FORMAT(date, '%Y-%m') = ?"
    );
    $expenseStmt->execute([$userId, $month]);
    $expense = abs((float) $expenseStmt->fetchColumn());

    $byCategoryStmt = $pdo->prepare(
        "SELECT c.id, c.name, c.color, SUM(t.amount) AS total FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = ? AND t.type = 'EXPENSE' AND t.status = 'CLEARED' AND DATE_FORMAT(t.date, '%Y-%m') = ?
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

    $uncategorizedStmt = $pdo->prepare(
        "SELECT COUNT(*) FROM transactions
         WHERE user_id = ? AND type = 'EXPENSE' AND status = 'CLEARED' AND category_id IS NULL AND DATE_FORMAT(date, '%Y-%m') = ?"
    );
    $uncategorizedStmt->execute([$userId, $month]);
    $uncategorized = (int) $uncategorizedStmt->fetchColumn();

    $alerts = [];
    $invoiceStmt = $pdo->prepare(
        "SELECT i.*, a.name account_name,
           COALESCE(ABS(SUM(t.amount)), 0) total
         FROM credit_card_invoices i
         JOIN accounts a ON a.id = i.account_id
         LEFT JOIN transactions t ON t.invoice_id = i.id AND t.type = 'EXPENSE'
         WHERE i.user_id = ? AND i.status IN ('CLOSED','OVERDUE')
         GROUP BY i.id, a.name ORDER BY i.due_date ASC LIMIT 5"
    );
    $invoiceStmt->execute([$userId]);
    foreach ($invoiceStmt->fetchAll() as $invoice) {
        $remaining = max(0, (float) $invoice['total'] - (float) $invoice['paid_amount']);
        if ($remaining > 0) {
            $alerts[] = [
                'kind' => $invoice['status'] === 'OVERDUE' ? 'danger' : 'warning',
                'title' => $invoice['status'] === 'OVERDUE' ? 'Fatura atrasada' : 'Fatura fechada',
                'message' => $invoice['account_name'] . ' · vence em ' . (new DateTime($invoice['due_date']))->format('d/m/Y'),
                'amount' => $remaining,
                'href' => '/cards.php',
            ];
        }
    }

    $budgetStmt = $pdo->prepare(
        "SELECT c.name, b.amount budget_amount, ABS(COALESCE(SUM(t.amount), 0)) spent
         FROM budgets b JOIN categories c ON c.id = b.category_id
         LEFT JOIN transactions t ON t.category_id = b.category_id AND t.user_id = b.user_id
           AND t.type = 'EXPENSE' AND t.status = 'CLEARED' AND DATE_FORMAT(t.date, '%Y-%m') = b.month
         WHERE b.user_id = ? AND b.month = ?
         GROUP BY b.id, c.name, b.amount
         HAVING spent >= b.amount * 0.8 ORDER BY spent / b.amount DESC LIMIT 5"
    );
    $budgetStmt->execute([$userId, $month]);
    foreach ($budgetStmt->fetchAll() as $budget) {
        $percent = (float) $budget['budget_amount'] > 0
            ? round(((float) $budget['spent'] / (float) $budget['budget_amount']) * 100)
            : 0;
        $alerts[] = [
            'kind' => $percent >= 100 ? 'danger' : 'warning',
            'title' => $percent >= 100 ? 'Orçamento ultrapassado' : 'Atenção ao orçamento',
            'message' => $budget['name'] . ' · ' . $percent . '% utilizado',
            'amount' => (float) $budget['spent'],
            'href' => '/budgets.php',
        ];
    }

    json_response([
        'month' => $month,
        'totalBalance' => $netWorth,
        'availableBalance' => $availableBalance,
        'creditCardDebt' => $creditCardDebt,
        'netWorth' => $netWorth,
        'income' => $income,
        'expense' => $expense,
        'net' => round($income - $expense, 2),
        'savingsRate' => $income > 0 ? round((($income - $expense) / $income) * 100, 1) : 0,
        'uncategorizedCount' => $uncategorized,
        'spendingByCategory' => $spendingByCategory,
        'alerts' => $alerts,
    ]);
}

function dashboard_forecast(string $userId): void
{
    $pdo = db();
    $today = new DateTime('first day of this month');
    $months = max(1, min(12, (int) ($_GET['months'] ?? 6)));
    $end = (clone $today)->modify('+' . $months . ' months')->modify('-1 day');

    $stmt = $pdo->prepare(
        "SELECT DATE_FORMAT(date, '%Y-%m') month,
           SUM(CASE WHEN type = 'INCOME' THEN amount WHEN type = 'EXPENSE' THEN amount ELSE 0 END) net
         FROM transactions
         WHERE user_id = ? AND date BETWEEN ? AND ? AND type IN ('INCOME','EXPENSE')
         GROUP BY DATE_FORMAT(date, '%Y-%m')"
    );
    $stmt->execute([$userId, $today->format('Y-m-d'), $end->format('Y-m-d')]);
    $known = [];
    foreach ($stmt->fetchAll() as $row) {
        $known[$row['month']] = (float) $row['net'];
    }

    $recurringStmt = $pdo->prepare(
        "SELECT type, amount, frequency, next_run_date, end_date
         FROM recurring_transactions
         WHERE user_id = ? AND next_run_date <= ? AND (end_date IS NULL OR end_date >= ?)"
    );
    $recurringStmt->execute([$userId, $end->format('Y-m-d'), $today->format('Y-m-d')]);
    $recurring = $recurringStmt->fetchAll();
    $recurringByMonth = [];
    foreach ($recurring as $item) {
        $cursor = new DateTime($item['next_run_date']);
        $guard = 0;
        while ($cursor <= $end && $guard++ < 400) {
            if ($cursor >= $today && (!$item['end_date'] || $cursor->format('Y-m-d') <= $item['end_date'])) {
                $monthKey = $cursor->format('Y-m');
                $value = abs((float) $item['amount']);
                $recurringByMonth[$monthKey] = ($recurringByMonth[$monthKey] ?? 0)
                    + ($item['type'] === 'EXPENSE' ? -$value : $value);
            }
            switch ($item['frequency']) {
                case 'WEEKLY': $cursor->modify('+7 days'); break;
                case 'BIWEEKLY': $cursor->modify('+14 days'); break;
                case 'YEARLY': $cursor->modify('+1 year'); break;
                default: $cursor->modify('+1 month'); break;
            }
        }
    }

    $result = [];
    $running = 0.0;
    for ($i = 0; $i < $months; $i++) {
        $monthDate = (clone $today)->modify("+$i months");
        $month = $monthDate->format('Y-m');
        $net = ($known[$month] ?? 0.0) + ($recurringByMonth[$month] ?? 0.0);
        $running += $net;
        $result[] = ['month' => $month, 'net' => round($net, 2), 'cumulative' => round($running, 2)];
    }
    json_response($result);
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
         WHERE user_id = ? AND type IN ('INCOME','EXPENSE') AND status = 'CLEARED' AND date >= ?
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
