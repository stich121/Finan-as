<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/matcher.php';

function handle_route(array $segments, string $method): void
{
    $userId = require_login();

    if (empty($segments)) {
        if ($method === 'GET') {
            rules_list($userId);
            return;
        }
        if ($method === 'POST') {
            require_csrf();
            rules_create($userId);
            return;
        }
    } elseif (count($segments) === 1) {
        $id = $segments[0];
        if ($method === 'PATCH') {
            require_csrf();
            rules_update($userId, $id);
            return;
        }
        if ($method === 'DELETE') {
            require_csrf();
            rules_delete($userId, $id);
            return;
        }
    }

    error_response('Rota de regras não encontrada.', 404);
}

function rules_find(string $userId, string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM category_rules WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $rule = $stmt->fetch();
    return $rule ?: null;
}

function rule_out(array $r): array
{
    return [
        'id' => $r['id'],
        'categoryId' => $r['category_id'],
        'matchField' => $r['match_field'],
        'matchType' => $r['match_type'],
        'pattern' => $r['pattern'],
        'priority' => (int) $r['priority'],
        'enabled' => (bool) $r['enabled'],
    ];
}

function rules_list(string $userId): void
{
    $stmt = db()->prepare('SELECT * FROM category_rules WHERE user_id = ? ORDER BY priority DESC, created_at ASC');
    $stmt->execute([$userId]);
    json_response(array_map('rule_out', $stmt->fetchAll()));
}

function rules_create(string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['categoryId', 'matchField', 'matchType', 'pattern']);
    require_enum('matchField', $data['matchField'], RULE_MATCH_FIELDS);
    require_enum('matchType', $data['matchType'], RULE_MATCH_TYPES);

    $category = categories_find_generic($userId, $data['categoryId']);
    if (!$category) {
        error_response('Categoria não encontrada.', 422);
    }

    $id = uuid_v4();
    db()->prepare(
        'INSERT INTO category_rules (id, user_id, category_id, match_field, match_type, pattern, priority, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $id,
        $userId,
        $data['categoryId'],
        $data['matchField'],
        $data['matchType'],
        trim((string) $data['pattern']),
        (int) ($data['priority'] ?? 0),
        array_key_exists('enabled', $data) ? (int) (bool) $data['enabled'] : 1,
        now_datetime(),
        now_datetime(),
    ]);

    json_response(rule_out(rules_find($userId, $id)), 201);
}

function rules_update(string $userId, string $id): void
{
    $rule = rules_find($userId, $id);
    if (!$rule) {
        error_response('Regra não encontrada.', 404);
    }
    $data = read_json_body();

    $fields = [
        'category_id' => $data['categoryId'] ?? $rule['category_id'],
        'match_field' => $data['matchField'] ?? $rule['match_field'],
        'match_type' => $data['matchType'] ?? $rule['match_type'],
        'pattern' => array_key_exists('pattern', $data) ? trim((string) $data['pattern']) : $rule['pattern'],
        'priority' => array_key_exists('priority', $data) ? (int) $data['priority'] : $rule['priority'],
        'enabled' => array_key_exists('enabled', $data) ? (int) (bool) $data['enabled'] : $rule['enabled'],
    ];
    require_enum('matchField', $fields['match_field'], RULE_MATCH_FIELDS);
    require_enum('matchType', $fields['match_type'], RULE_MATCH_TYPES);

    db()->prepare(
        'UPDATE category_rules SET category_id = ?, match_field = ?, match_type = ?, pattern = ?, priority = ?, enabled = ?, updated_at = ?
         WHERE id = ? AND user_id = ?'
    )->execute([
        $fields['category_id'],
        $fields['match_field'],
        $fields['match_type'],
        $fields['pattern'],
        $fields['priority'],
        $fields['enabled'],
        now_datetime(),
        $id,
        $userId,
    ]);

    json_response(rule_out(rules_find($userId, $id)));
}

function rules_delete(string $userId, string $id): void
{
    $stmt = db()->prepare('DELETE FROM category_rules WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    if ($stmt->rowCount() === 0) {
        error_response('Regra não encontrada.', 404);
    }
    json_response(['ok' => true]);
}

function categories_find_generic(string $userId, string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}
