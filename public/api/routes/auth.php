<?php

declare(strict_types=1);

function handle_route(array $segments, string $method): void
{
    $action = $segments[0] ?? '';

    if ($action === 'register' && $method === 'POST') {
        auth_register();
        return;
    }
    if ($action === 'login' && $method === 'POST') {
        auth_login();
        return;
    }
    if ($action === 'logout' && $method === 'POST') {
        auth_logout();
        return;
    }
    if ($action === 'me' && $method === 'GET') {
        auth_me();
        return;
    }
    if ($action === 'change-password' && $method === 'POST') {
        auth_change_password();
        return;
    }

    error_response('Rota de autenticação não encontrada.', 404);
}

function auth_public_user(array $user): array
{
    return [
        'id' => $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'currency' => $user['currency'],
        'theme' => $user['theme'],
        'csrfToken' => current_csrf_token(),
    ];
}

function auth_register(): void
{
    $data = read_json_body();
    require_fields($data, ['name', 'email', 'password']);

    $name = trim((string) $data['name']);
    $email = strtolower(trim((string) $data['email']));
    $password = (string) $data['password'];

    if (!is_valid_email($email)) {
        error_response('E-mail inválido.', 422);
    }
    if (strlen($password) < 8) {
        error_response('A senha deve ter pelo menos 8 caracteres.', 422);
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        error_response('Já existe uma conta com este e-mail.', 409);
    }

    $userId = uuid_v4();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO users (id, name, email, password_hash, currency, theme, created_at, updated_at)
             VALUES (?, ?, ?, ?, "BRL", "system", ?, ?)'
        )->execute([$userId, $name, $email, password_hash($password, PASSWORD_DEFAULT), now_datetime(), now_datetime()]);

        seed_default_categories_and_rules($pdo, $userId);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    login_user($userId);
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    json_response(auth_public_user($stmt->fetch()), 201);
}

function auth_login(): void
{
    $data = read_json_body();
    require_fields($data, ['email', 'password']);

    $email = strtolower(trim((string) $data['email']));
    $password = (string) $data['password'];

    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        error_response('E-mail ou senha incorretos.', 401);
    }

    login_user($user['id']);
    json_response(auth_public_user($user));
}

function auth_logout(): void
{
    logout_user();
    json_response(['ok' => true]);
}

function auth_me(): void
{
    $userId = current_user_id();
    if (!$userId) {
        error_response('Não autenticado.', 401);
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) {
        logout_user();
        error_response('Não autenticado.', 401);
    }

    json_response(auth_public_user($user));
}

function auth_change_password(): void
{
    $userId = require_login();
    require_csrf();
    $data = read_json_body();
    require_fields($data, ['currentPassword', 'newPassword']);

    $newPassword = (string) $data['newPassword'];
    if (strlen($newPassword) < 8) {
        error_response('A nova senha deve ter pelo menos 8 caracteres.', 422);
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if (!$user || !password_verify((string) $data['currentPassword'], $user['password_hash'])) {
        error_response('Senha atual incorreta.', 401);
    }

    $pdo->prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        ->execute([password_hash($newPassword, PASSWORD_DEFAULT), now_datetime(), $userId]);

    // Invalida a sessão atual e força novo login, como acontecia com a revogação de refresh tokens.
    logout_user();
    json_response(['ok' => true]);
}

function seed_default_categories_and_rules(PDO $pdo, string $userId): void
{
    $expenseCategories = [
        'Alimentação' => ['color' => '#f97316', 'icon' => 'utensils'],
        'Transporte' => ['color' => '#0ea5e9', 'icon' => 'car'],
        'Moradia' => ['color' => '#8b5cf6', 'icon' => 'home'],
        'Lazer' => ['color' => '#ec4899', 'icon' => 'sparkles'],
        'Saúde' => ['color' => '#22c55e', 'icon' => 'heart-pulse'],
        'Educação' => ['color' => '#eab308', 'icon' => 'book'],
        'Compras' => ['color' => '#f43f5e', 'icon' => 'shopping-bag'],
        'Assinaturas' => ['color' => '#6366f1', 'icon' => 'repeat'],
        'Outros' => ['color' => '#64748b', 'icon' => 'more-horizontal'],
    ];
    $incomeCategories = [
        'Salário' => ['color' => '#16a34a', 'icon' => 'wallet'],
        'Freelance' => ['color' => '#0891b2', 'icon' => 'briefcase'],
        'Investimentos' => ['color' => '#7c3aed', 'icon' => 'trending-up'],
        'Outras receitas' => ['color' => '#64748b', 'icon' => 'more-horizontal'],
    ];

    $categoryIds = [];
    $insertCategory = $pdo->prepare(
        'INSERT INTO categories (id, user_id, name, kind, parent_id, color, icon, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)'
    );

    foreach ($expenseCategories as $name => $meta) {
        $id = uuid_v4();
        $categoryIds[$name] = $id;
        $insertCategory->execute([$id, $userId, $name, 'EXPENSE', $meta['color'], $meta['icon'], now_datetime(), now_datetime()]);
    }
    foreach ($incomeCategories as $name => $meta) {
        $id = uuid_v4();
        $categoryIds[$name] = $id;
        $insertCategory->execute([$id, $userId, $name, 'INCOME', $meta['color'], $meta['icon'], now_datetime(), now_datetime()]);
    }

    // Regras padrão de categorização automática (palavras comuns em descrição/beneficiário de extratos BR).
    $defaultRules = [
        ['category' => 'Alimentação', 'pattern' => 'IFOOD', 'priority' => 100],
        ['category' => 'Alimentação', 'pattern' => 'RESTAURANTE', 'priority' => 90],
        ['category' => 'Alimentação', 'pattern' => 'MERCADO', 'priority' => 90],
        ['category' => 'Alimentação', 'pattern' => 'SUPERMERCADO', 'priority' => 90],
        ['category' => 'Transporte', 'pattern' => 'UBER', 'priority' => 100],
        ['category' => 'Transporte', 'pattern' => '99APP', 'priority' => 100],
        ['category' => 'Transporte', 'pattern' => 'POSTO', 'priority' => 90],
        ['category' => 'Assinaturas', 'pattern' => 'NETFLIX', 'priority' => 100],
        ['category' => 'Assinaturas', 'pattern' => 'SPOTIFY', 'priority' => 100],
        ['category' => 'Saúde', 'pattern' => 'FARMACIA', 'priority' => 90],
        ['category' => 'Salário', 'pattern' => 'SALARIO', 'priority' => 100],
        ['category' => 'Salário', 'pattern' => 'PAGAMENTO SALARIO', 'priority' => 100],
    ];

    $insertRule = $pdo->prepare(
        'INSERT INTO category_rules (id, user_id, category_id, match_field, match_type, pattern, priority, enabled, created_at, updated_at)
         VALUES (?, ?, ?, "DESCRIPTION", "CONTAINS", ?, ?, 1, ?, ?)'
    );
    foreach ($defaultRules as $rule) {
        if (!isset($categoryIds[$rule['category']])) {
            continue;
        }
        $insertRule->execute([
            uuid_v4(),
            $userId,
            $categoryIds[$rule['category']],
            $rule['pattern'],
            $rule['priority'],
            now_datetime(),
            now_datetime(),
        ]);
    }
}
