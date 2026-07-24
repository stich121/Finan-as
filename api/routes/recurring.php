<?php

declare(strict_types=1);

const RECURRING_FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY'];

function handle_route(array $segments, string $method): void
{
    $userId = require_login();

    if (empty($segments)) {
        if ($method === 'GET') {
            recurring_list($userId);
            return;
        }
        if ($method === 'POST') {
            require_csrf();
            recurring_create($userId);
            return;
        }
    } elseif (count($segments) === 1) {
        $id = $segments[0];
        if ($method === 'PATCH') {
            require_csrf();
            recurring_update($userId, $id);
            return;
        }
        if ($method === 'DELETE') {
            require_csrf();
            recurring_delete($userId, $id);
            return;
        }
    } elseif (count($segments) === 2 && $segments[1] === 'post' && $method === 'POST') {
        require_csrf();
        recurring_post_next($userId, $segments[0]);
        return;
    }

    error_response('Rota de recorrências não encontrada.', 404);
}

function recurring_find(string $userId, string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM recurring_transactions WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function recurring_out(array $r): array
{
    return [
        'id' => $r['id'],
        'accountId' => $r['account_id'],
        'categoryId' => $r['category_id'],
        'type' => $r['type'],
        'amount' => (float) $r['amount'],
        'description' => $r['description'],
        'frequency' => $r['frequency'],
        'startDate' => $r['start_date'],
        'endDate' => $r['end_date'],
        'nextRunDate' => $r['next_run_date'],
        'autoPost' => (bool) $r['auto_post'],
    ];
}

function recurring_list(string $userId): void
{
    $stmt = db()->prepare('SELECT * FROM recurring_transactions WHERE user_id = ? ORDER BY next_run_date ASC');
    $stmt->execute([$userId]);
    json_response(array_map('recurring_out', $stmt->fetchAll()));
}

function recurring_create(string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['accountId', 'type', 'amount', 'description', 'frequency', 'startDate']);
    require_enum('type', $data['type'], ['INCOME', 'EXPENSE']);
    require_enum('frequency', $data['frequency'], RECURRING_FREQUENCIES);

    $amount = decimal_amount($data['amount']);
    $id = uuid_v4();

    db()->prepare(
        'INSERT INTO recurring_transactions (id, user_id, account_id, category_id, type, amount, description, frequency, start_date, end_date, next_run_date, auto_post, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $id,
        $userId,
        $data['accountId'],
        $data['categoryId'] ?? null,
        $data['type'],
        abs($amount),
        trim((string) $data['description']),
        $data['frequency'],
        $data['startDate'],
        $data['endDate'] ?? null,
        $data['nextRunDate'] ?? $data['startDate'],
        !empty($data['autoPost']) ? 1 : 0,
        now_datetime(),
        now_datetime(),
    ]);

    json_response(recurring_out(recurring_find($userId, $id)), 201);
}

function recurring_update(string $userId, string $id): void
{
    $r = recurring_find($userId, $id);
    if (!$r) {
        error_response('Recorrência não encontrada.', 404);
    }
    $data = read_json_body();

    $fields = [
        'account_id' => $data['accountId'] ?? $r['account_id'],
        'category_id' => array_key_exists('categoryId', $data) ? $data['categoryId'] : $r['category_id'],
        'type' => $data['type'] ?? $r['type'],
        'amount' => isset($data['amount']) ? abs(decimal_amount($data['amount'])) : $r['amount'],
        'description' => $data['description'] ?? $r['description'],
        'frequency' => $data['frequency'] ?? $r['frequency'],
        'start_date' => $data['startDate'] ?? $r['start_date'],
        'end_date' => array_key_exists('endDate', $data) ? $data['endDate'] : $r['end_date'],
        'next_run_date' => $data['nextRunDate'] ?? $r['next_run_date'],
        'auto_post' => array_key_exists('autoPost', $data) ? (int) (bool) $data['autoPost'] : $r['auto_post'],
    ];
    require_enum('type', $fields['type'], ['INCOME', 'EXPENSE']);
    require_enum('frequency', $fields['frequency'], RECURRING_FREQUENCIES);

    db()->prepare(
        'UPDATE recurring_transactions SET account_id=?, category_id=?, type=?, amount=?, description=?, frequency=?, start_date=?, end_date=?, next_run_date=?, auto_post=?, updated_at=?
         WHERE id = ? AND user_id = ?'
    )->execute([
        $fields['account_id'], $fields['category_id'], $fields['type'], $fields['amount'], trim((string) $fields['description']),
        $fields['frequency'], $fields['start_date'], $fields['end_date'], $fields['next_run_date'], $fields['auto_post'],
        now_datetime(), $id, $userId,
    ]);

    json_response(recurring_out(recurring_find($userId, $id)));
}

function recurring_delete(string $userId, string $id): void
{
    $stmt = db()->prepare('DELETE FROM recurring_transactions WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    if ($stmt->rowCount() === 0) {
        error_response('Recorrência não encontrada.', 404);
    }
    json_response(['ok' => true]);
}

function recurring_next_date(string $currentDate, string $frequency): string
{
    $date = new DateTime($currentDate);
    switch ($frequency) {
        case 'WEEKLY':
            $date->modify('+7 days');
            break;
        case 'BIWEEKLY':
            $date->modify('+14 days');
            break;
        case 'MONTHLY':
            $date->modify('+1 month');
            break;
        case 'YEARLY':
            $date->modify('+1 year');
            break;
    }
    return $date->format('Y-m-d');
}

function recurring_post_next(string $userId, string $id): void
{
    $r = recurring_find($userId, $id);
    if (!$r) {
        error_response('Recorrência não encontrada.', 404);
    }

    $account = db()->prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?');
    $account->execute([$r['account_id'], $userId]);
    $account = $account->fetch();
    if (!$account) {
        error_response('Conta associada não encontrada.', 422);
    }

    $signedAmount = $r['type'] === 'EXPENSE' ? -abs((float) $r['amount']) : abs((float) $r['amount']);
    $txId = uuid_v4();
    $postedDate = $r['next_run_date'];
    $nextDate = recurring_next_date($postedDate, $r['frequency']);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, date, description, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, "MANUAL", ?, ?)'
        )->execute([$txId, $userId, $r['account_id'], $r['category_id'], $r['type'], $signedAmount, $postedDate, $r['description'], now_datetime(), now_datetime()]);

        $pdo->prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?')
            ->execute([$signedAmount, now_datetime(), $r['account_id']]);

        $pdo->prepare('UPDATE recurring_transactions SET next_run_date = ?, updated_at = ? WHERE id = ? AND user_id = ?')
            ->execute([$nextDate, now_datetime(), $id, $userId]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    json_response([
        'recurring' => recurring_out(recurring_find($userId, $id)),
        'postedTransactionId' => $txId,
    ]);
}
