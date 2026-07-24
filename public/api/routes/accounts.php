<?php

declare(strict_types=1);

const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT'];

function handle_route(array $segments, string $method): void
{
    $userId = require_login();

    if (empty($segments)) {
        if ($method === 'GET') {
            accounts_list($userId);
            return;
        }
        if ($method === 'POST') {
            require_csrf();
            accounts_create($userId);
            return;
        }
    } elseif (count($segments) === 1) {
        $id = $segments[0];
        if ($method === 'GET') {
            accounts_get($userId, $id);
            return;
        }
        if ($method === 'PATCH') {
            require_csrf();
            accounts_update($userId, $id);
            return;
        }
        if ($method === 'DELETE') {
            require_csrf();
            accounts_delete($userId, $id);
            return;
        }
    } elseif (count($segments) === 2 && $segments[1] === 'adjust-balance' && $method === 'POST') {
        require_csrf();
        accounts_adjust_balance($userId, $segments[0]);
        return;
    }

    error_response('Rota de contas não encontrada.', 404);
}

function accounts_find(string $userId, string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $account = $stmt->fetch();
    return $account ?: null;
}

function account_out(array $a): array
{
    return [
        'id' => $a['id'],
        'name' => $a['name'],
        'type' => $a['type'],
        'institution' => $a['institution'],
        'balance' => (float) $a['balance'],
        'color' => $a['color'],
        'archived' => (bool) $a['archived'],
        'createdAt' => $a['created_at'],
        'updatedAt' => $a['updated_at'],
    ];
}

function accounts_list(string $userId): void
{
    $includeArchived = isset($_GET['includeArchived']) && $_GET['includeArchived'] !== '0' && $_GET['includeArchived'] !== 'false';
    $sql = 'SELECT * FROM accounts WHERE user_id = ?';
    if (!$includeArchived) {
        $sql .= ' AND archived = 0';
    }
    $sql .= ' ORDER BY archived ASC, name ASC';
    $stmt = db()->prepare($sql);
    $stmt->execute([$userId]);
    json_response(array_map('account_out', $stmt->fetchAll()));
}

function accounts_get(string $userId, string $id): void
{
    $account = accounts_find($userId, $id);
    if (!$account) {
        error_response('Conta não encontrada.', 404);
    }
    json_response(account_out($account));
}

function accounts_create(string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['name', 'type']);
    require_enum('type', $data['type'], ACCOUNT_TYPES);

    $id = uuid_v4();
    $balance = isset($data['balance']) ? decimal_amount($data['balance']) : 0.0;

    db()->prepare(
        'INSERT INTO accounts (id, user_id, name, type, institution, balance, color, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)'
    )->execute([
        $id,
        $userId,
        trim((string) $data['name']),
        $data['type'],
        $data['institution'] ?? null,
        $balance,
        $data['color'] ?? null,
        now_datetime(),
        now_datetime(),
    ]);

    json_response(account_out(accounts_find($userId, $id)), 201);
}

function accounts_update(string $userId, string $id): void
{
    $account = accounts_find($userId, $id);
    if (!$account) {
        error_response('Conta não encontrada.', 404);
    }
    $data = read_json_body();

    $fields = [
        'name' => $data['name'] ?? $account['name'],
        'type' => $data['type'] ?? $account['type'],
        'institution' => array_key_exists('institution', $data) ? $data['institution'] : $account['institution'],
        'color' => array_key_exists('color', $data) ? $data['color'] : $account['color'],
        'archived' => array_key_exists('archived', $data) ? (int) (bool) $data['archived'] : $account['archived'],
    ];
    require_enum('type', $fields['type'], ACCOUNT_TYPES);

    db()->prepare(
        'UPDATE accounts SET name = ?, type = ?, institution = ?, color = ?, archived = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    )->execute([
        trim((string) $fields['name']),
        $fields['type'],
        $fields['institution'],
        $fields['color'],
        $fields['archived'],
        now_datetime(),
        $id,
        $userId,
    ]);

    json_response(account_out(accounts_find($userId, $id)));
}

function accounts_delete(string $userId, string $id): void
{
    $account = accounts_find($userId, $id);
    if (!$account) {
        error_response('Conta não encontrada.', 404);
    }
    db()->prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?')->execute([$id, $userId]);
    json_response(['ok' => true]);
}

function accounts_adjust_balance(string $userId, string $id): void
{
    $account = accounts_find($userId, $id);
    if (!$account) {
        error_response('Conta não encontrada.', 404);
    }
    $data = read_json_body();
    require_fields($data, ['balance']);
    $newBalance = decimal_amount($data['balance']);
    $diff = round($newBalance - (float) $account['balance'], 2);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        if (abs($diff) >= 0.01) {
            $txId = uuid_v4();
            $type = $diff >= 0 ? 'INCOME' : 'EXPENSE';
            $pdo->prepare(
                'INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, date, description, source, created_at, updated_at)
                 VALUES (?, ?, ?, NULL, ?, ?, ?, "Ajuste de saldo", "MANUAL", ?, ?)'
            )->execute([
                $txId,
                $userId,
                $id,
                $type,
                $diff,
                (new DateTime('today'))->format('Y-m-d'),
                now_datetime(),
                now_datetime(),
            ]);
        }

        $pdo->prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ? AND user_id = ?')
            ->execute([$newBalance, now_datetime(), $id, $userId]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    json_response(account_out(accounts_find($userId, $id)));
}
