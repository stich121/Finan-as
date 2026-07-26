<?php

declare(strict_types=1);

function budget_month_bounds(string $month): array
{
    $start = DateTime::createFromFormat('!Y-m', $month);
    if (!$start) {
        throw new InvalidArgumentException('Mês inválido.');
    }
    return [$start->format('Y-m-d'), (clone $start)->modify('+1 month')->format('Y-m-d')];
}

function handle_route(array $segments, string $method): void
{
    $userId = require_login();

    if (empty($segments)) {
        if ($method === 'GET') {
            budgets_list($userId);
            return;
        }
        if ($method === 'POST') {
            require_csrf();
            budgets_upsert($userId);
            return;
        }
    } elseif (count($segments) === 1) {
        $id = $segments[0];
        if ($method === 'PATCH') {
            require_csrf();
            budgets_update($userId, $id);
            return;
        }
        if ($method === 'DELETE') {
            require_csrf();
            budgets_delete($userId, $id);
            return;
        }
    }

    error_response('Rota de orçamento não encontrada.', 404);
}

function budgets_find(string $userId, string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function budgets_find_out(string $userId, string $id): ?array
{
    $pdo = db();
    $stmt = $pdo->prepare(
        'SELECT b.*, c.name AS category_name, c.color AS category_color
         FROM budgets b JOIN categories c ON c.id = b.category_id
         WHERE b.id = ? AND b.user_id = ?'
    );
    $stmt->execute([$id, $userId]);
    $b = $stmt->fetch();
    if (!$b) {
        return null;
    }

    [$monthStart, $monthEnd] = budget_month_bounds((string) $b['month']);
    $statusFilter = db_column_exists($pdo, 'transactions', 'status') ? " AND status = 'CLEARED'" : '';
    $spentStmt = $pdo->prepare(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions
         WHERE user_id = ? AND category_id = ? AND type = 'EXPENSE'{$statusFilter}
           AND date >= ? AND date < ?"
    );
    $spentStmt->execute([$userId, $b['category_id'], $monthStart, $monthEnd]);
    $spent = abs((float) $spentStmt->fetchColumn());

    return [
        'id' => $b['id'],
        'categoryId' => $b['category_id'],
        'categoryName' => $b['category_name'],
        'categoryColor' => $b['category_color'],
        'month' => $b['month'],
        'amount' => (float) $b['amount'],
        'spent' => $spent,
    ];
}

function budgets_list(string $userId): void
{
    $month = (string) ($_GET['month'] ?? (new DateTime('now'))->format('Y-m'));
    if (!month_string_valid($month)) {
        error_response('Parâmetro "month" inválido (use YYYY-MM).', 422);
    }

    $pdo = db();
    [$monthStart, $monthEnd] = budget_month_bounds($month);
    $stmt = $pdo->prepare(
        'SELECT b.*, c.name AS category_name, c.color AS category_color
         FROM budgets b JOIN categories c ON c.id = b.category_id
         WHERE b.user_id = ? AND BINARY b.month = BINARY ? ORDER BY c.name ASC'
    );
    $stmt->execute([$userId, $month]);
    $budgets = $stmt->fetchAll();

    $statusFilter = db_column_exists($pdo, 'transactions', 'status') ? " AND status = 'CLEARED'" : '';
    $spentStmt = $pdo->prepare(
        "SELECT category_id, SUM(amount) AS total FROM transactions
         WHERE user_id = ? AND type = 'EXPENSE'{$statusFilter} AND date >= ? AND date < ?
         GROUP BY category_id"
    );
    $spentStmt->execute([$userId, $monthStart, $monthEnd]);
    $spentByCategory = [];
    foreach ($spentStmt->fetchAll() as $row) {
        $spentByCategory[$row['category_id']] = abs((float) $row['total']);
    }

    json_response(array_map(function ($b) use ($spentByCategory) {
        return [
            'id' => $b['id'],
            'categoryId' => $b['category_id'],
            'categoryName' => $b['category_name'],
            'categoryColor' => $b['category_color'],
            'month' => $b['month'],
            'amount' => (float) $b['amount'],
            'spent' => $spentByCategory[$b['category_id']] ?? 0.0,
        ];
    }, $budgets));
}

function budgets_upsert(string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['categoryId', 'month', 'amount']);
    if (!month_string_valid((string) $data['month'])) {
        error_response('Parâmetro "month" inválido (use YYYY-MM).', 422);
    }
    $amount = decimal_amount($data['amount']);

    $pdo = db();
    $stmt = $pdo->prepare('SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND BINARY month = BINARY ?');
    $stmt->execute([$userId, $data['categoryId'], $data['month']]);
    $existing = $stmt->fetch();

    if ($existing) {
        $pdo->prepare('UPDATE budgets SET amount = ?, updated_at = ? WHERE id = ?')
            ->execute([$amount, now_datetime(), $existing['id']]);
        json_response(budgets_find_out($userId, $existing['id']));
        return;
    }

    $id = uuid_v4();
    $pdo->prepare(
        'INSERT INTO budgets (id, user_id, category_id, month, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([$id, $userId, $data['categoryId'], $data['month'], $amount, now_datetime(), now_datetime()]);

    json_response(budgets_find_out($userId, $id), 201);
}

function budgets_update(string $userId, string $id): void
{
    $budget = budgets_find($userId, $id);
    if (!$budget) {
        error_response('Orçamento não encontrado.', 404);
    }
    $data = read_json_body();
    $amount = isset($data['amount']) ? decimal_amount($data['amount']) : (float) $budget['amount'];

    db()->prepare('UPDATE budgets SET amount = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        ->execute([$amount, now_datetime(), $id, $userId]);

    json_response(budgets_find_out($userId, $id));
}

function budgets_delete(string $userId, string $id): void
{
    $stmt = db()->prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    if ($stmt->rowCount() === 0) {
        error_response('Orçamento não encontrado.', 404);
    }
    json_response(['ok' => true]);
}
