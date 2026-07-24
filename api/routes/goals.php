<?php

declare(strict_types=1);

function handle_route(array $segments, string $method): void
{
    $userId = require_login();

    if (empty($segments)) {
        if ($method === 'GET') {
            goals_list($userId);
            return;
        }
        if ($method === 'POST') {
            require_csrf();
            goals_create($userId);
            return;
        }
    } elseif (count($segments) === 1) {
        $id = $segments[0];
        if ($method === 'PATCH') {
            require_csrf();
            goals_update($userId, $id);
            return;
        }
        if ($method === 'DELETE') {
            require_csrf();
            goals_delete($userId, $id);
            return;
        }
    } elseif (count($segments) === 2 && $segments[1] === 'contribute' && $method === 'POST') {
        require_csrf();
        goals_contribute($userId, $segments[0]);
        return;
    }

    error_response('Rota de metas não encontrada.', 404);
}

function goals_find(string $userId, string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function goal_out(array $g): array
{
    $target = (float) $g['target_amount'];
    $current = (float) $g['current_amount'];
    return [
        'id' => $g['id'],
        'name' => $g['name'],
        'targetAmount' => $target,
        'currentAmount' => $current,
        'progress' => $target > 0 ? min(100, round(($current / $target) * 100, 1)) : 0,
        'targetDate' => $g['target_date'],
        'color' => $g['color'],
        'achievedAt' => $g['achieved_at'],
    ];
}

function goals_list(string $userId): void
{
    $stmt = db()->prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY (achieved_at IS NOT NULL), target_date IS NULL, target_date ASC, created_at ASC');
    $stmt->execute([$userId]);
    json_response(array_map('goal_out', $stmt->fetchAll()));
}

function goals_create(string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['name', 'targetAmount']);
    $targetAmount = decimal_amount($data['targetAmount']);
    if ($targetAmount <= 0) {
        error_response('O valor alvo precisa ser maior que zero.', 422);
    }

    $id = uuid_v4();
    db()->prepare(
        'INSERT INTO goals (id, user_id, name, target_amount, current_amount, target_date, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $id,
        $userId,
        trim((string) $data['name']),
        $targetAmount,
        isset($data['currentAmount']) ? decimal_amount($data['currentAmount']) : 0,
        $data['targetDate'] ?? null,
        $data['color'] ?? null,
        now_datetime(),
        now_datetime(),
    ]);

    json_response(goal_out(goals_find($userId, $id)), 201);
}

function goals_update(string $userId, string $id): void
{
    $goal = goals_find($userId, $id);
    if (!$goal) {
        error_response('Meta não encontrada.', 404);
    }
    $data = read_json_body();

    $fields = [
        'name' => $data['name'] ?? $goal['name'],
        'target_amount' => isset($data['targetAmount']) ? decimal_amount($data['targetAmount']) : $goal['target_amount'],
        'target_date' => array_key_exists('targetDate', $data) ? $data['targetDate'] : $goal['target_date'],
        'color' => array_key_exists('color', $data) ? $data['color'] : $goal['color'],
    ];

    db()->prepare('UPDATE goals SET name = ?, target_amount = ?, target_date = ?, color = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        ->execute([trim((string) $fields['name']), $fields['target_amount'], $fields['target_date'], $fields['color'], now_datetime(), $id, $userId]);

    json_response(goal_out(goals_find($userId, $id)));
}

function goals_delete(string $userId, string $id): void
{
    $stmt = db()->prepare('DELETE FROM goals WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    if ($stmt->rowCount() === 0) {
        error_response('Meta não encontrada.', 404);
    }
    json_response(['ok' => true]);
}

function goals_contribute(string $userId, string $id): void
{
    $goal = goals_find($userId, $id);
    if (!$goal) {
        error_response('Meta não encontrada.', 404);
    }
    $data = read_json_body();
    require_fields($data, ['amount']);
    $amount = decimal_amount($data['amount']);

    $newCurrent = round((float) $goal['current_amount'] + $amount, 2);
    if ($newCurrent < 0) {
        $newCurrent = 0;
    }

    $achievedAt = $goal['achieved_at'];
    if ($newCurrent >= (float) $goal['target_amount'] && !$achievedAt) {
        $achievedAt = now_datetime();
    } elseif ($newCurrent < (float) $goal['target_amount']) {
        $achievedAt = null;
    }

    db()->prepare('UPDATE goals SET current_amount = ?, achieved_at = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        ->execute([$newCurrent, $achievedAt, now_datetime(), $id, $userId]);

    json_response(goal_out(goals_find($userId, $id)));
}
