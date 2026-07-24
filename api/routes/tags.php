<?php

declare(strict_types=1);

function handle_route(array $segments, string $method): void
{
    $userId = require_login();

    if (empty($segments)) {
        if ($method === 'GET') {
            tags_list($userId);
            return;
        }
        if ($method === 'POST') {
            require_csrf();
            tags_create($userId);
            return;
        }
    } elseif (count($segments) === 1 && $method === 'DELETE') {
        require_csrf();
        tags_delete($userId, $segments[0]);
        return;
    }

    error_response('Rota de tags não encontrada.', 404);
}

function tag_out(array $t): array
{
    return ['id' => $t['id'], 'name' => $t['name'], 'color' => $t['color']];
}

function tags_list(string $userId): void
{
    $stmt = db()->prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC');
    $stmt->execute([$userId]);
    json_response(array_map('tag_out', $stmt->fetchAll()));
}

function tags_create(string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['name']);
    $name = trim((string) $data['name']);

    $stmt = db()->prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?');
    $stmt->execute([$userId, $name]);
    if ($stmt->fetch()) {
        error_response('Já existe uma tag com este nome.', 409);
    }

    $id = uuid_v4();
    db()->prepare('INSERT INTO tags (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([$id, $userId, $name, $data['color'] ?? null, now_datetime()]);

    json_response(['id' => $id, 'name' => $name, 'color' => $data['color'] ?? null], 201);
}

function tags_delete(string $userId, string $id): void
{
    $stmt = db()->prepare('DELETE FROM tags WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    if ($stmt->rowCount() === 0) {
        error_response('Tag não encontrada.', 404);
    }
    json_response(['ok' => true]);
}
