<?php

declare(strict_types=1);

const CATEGORY_KINDS = ['INCOME', 'EXPENSE'];

function handle_route(array $segments, string $method): void
{
    $userId = require_login();
    if (!db_column_exists(db(), 'categories', 'is_essential')) {
        db()->exec('ALTER TABLE categories ADD COLUMN is_essential TINYINT(1) NOT NULL DEFAULT 0 AFTER icon');
    }

    if (empty($segments)) {
        if ($method === 'GET') {
            categories_list($userId);
            return;
        }
        if ($method === 'POST') {
            require_csrf();
            categories_create($userId);
            return;
        }
    } elseif (count($segments) === 1) {
        $id = $segments[0];
        if ($method === 'PATCH') {
            require_csrf();
            categories_update($userId, $id);
            return;
        }
        if ($method === 'DELETE') {
            require_csrf();
            categories_delete($userId, $id);
            return;
        }
    }

    error_response('Rota de categorias não encontrada.', 404);
}

function categories_find(string $userId, string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $category = $stmt->fetch();
    return $category ?: null;
}

function category_out(array $c): array
{
    return [
        'id' => $c['id'],
        'name' => $c['name'],
        'kind' => $c['kind'],
        'parentId' => $c['parent_id'],
        'color' => $c['color'],
        'icon' => $c['icon'],
        'isEssential' => (bool) ($c['is_essential'] ?? false),
    ];
}

function categories_list(string $userId): void
{
    $stmt = db()->prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY kind ASC, name ASC');
    $stmt->execute([$userId]);
    json_response(array_map('category_out', $stmt->fetchAll()));
}

function categories_create(string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['name', 'kind']);
    require_enum('kind', $data['kind'], CATEGORY_KINDS);

    $parentId = $data['parentId'] ?? null;
    if ($parentId) {
        $parent = categories_find($userId, $parentId);
        if (!$parent) {
            error_response('Categoria pai não encontrada.', 422);
        }
    }

    $id = uuid_v4();
    db()->prepare(
        'INSERT INTO categories (id, user_id, name, kind, parent_id, color, icon, is_essential, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $id,
        $userId,
        trim((string) $data['name']),
        $data['kind'],
        $parentId,
        $data['color'] ?? null,
        $data['icon'] ?? null,
        !empty($data['isEssential']) ? 1 : 0,
        now_datetime(),
        now_datetime(),
    ]);

    json_response(category_out(categories_find($userId, $id)), 201);
}

function categories_update(string $userId, string $id): void
{
    $category = categories_find($userId, $id);
    if (!$category) {
        error_response('Categoria não encontrada.', 404);
    }
    $data = read_json_body();

    $parentId = array_key_exists('parentId', $data) ? $data['parentId'] : $category['parent_id'];
    if ($parentId === $id) {
        error_response('Uma categoria não pode ser pai dela mesma.', 422);
    }

    $fields = [
        'name' => $data['name'] ?? $category['name'],
        'kind' => $data['kind'] ?? $category['kind'],
        'color' => array_key_exists('color', $data) ? $data['color'] : $category['color'],
        'icon' => array_key_exists('icon', $data) ? $data['icon'] : $category['icon'],
        'is_essential' => array_key_exists('isEssential', $data) ? (int) (bool) $data['isEssential'] : (int) ($category['is_essential'] ?? 0),
    ];
    require_enum('kind', $fields['kind'], CATEGORY_KINDS);

    db()->prepare(
        'UPDATE categories SET name = ?, kind = ?, parent_id = ?, color = ?, icon = ?, is_essential = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    )->execute([
        trim((string) $fields['name']),
        $fields['kind'],
        $parentId,
        $fields['color'],
        $fields['icon'],
        $fields['is_essential'],
        now_datetime(),
        $id,
        $userId,
    ]);

    json_response(category_out(categories_find($userId, $id)));
}

function categories_delete(string $userId, string $id): void
{
    $category = categories_find($userId, $id);
    if (!$category) {
        error_response('Categoria não encontrada.', 404);
    }
    db()->prepare('DELETE FROM categories WHERE id = ? AND user_id = ?')->execute([$id, $userId]);
    json_response(['ok' => true]);
}
