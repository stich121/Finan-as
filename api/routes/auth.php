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

/**
 * Estrutura padrão de categorias e subcategorias criada para todo usuário novo
 * (mesmo formato usado pela tela de Categorias: pai -> filhas via parent_id).
 */
function default_category_tree(): array
{
    return [
        'EXPENSE' => [
            'Alimentação' => ['#f97316', ['Supermercado', 'Restaurante', 'Delivery', 'Padaria e café']],
            'Transporte' => ['#0ea5e9', ['Combustível', 'Uber e táxi', 'Transporte público', 'Estacionamento', 'Manutenção do veículo']],
            'Moradia' => ['#8b5cf6', ['Aluguel', 'Condomínio', 'Energia elétrica', 'Água', 'Internet', 'Gás']],
            'Saúde' => ['#22c55e', ['Farmácia', 'Plano de saúde', 'Consultas e exames', 'Academia']],
            'Educação' => ['#eab308', ['Mensalidade', 'Cursos', 'Livros e material']],
            'Lazer' => ['#ec4899', ['Streaming', 'Viagens', 'Cinema e shows', 'Hobbies']],
            'Compras' => ['#f43f5e', ['Roupas e calçados', 'Eletrônicos', 'Casa e decoração']],
            'Pets' => ['#14b8a6', ['Veterinário', 'Ração e petshop']],
            'Impostos e taxas' => ['#a855f7', ['IPVA e IPTU', 'Taxas bancárias']],
            'Outros' => ['#64748b', []],
        ],
        'INCOME' => [
            'Salário' => ['#16a34a', ['Salário fixo', 'Bônus e 13º']],
            'Freelance' => ['#0891b2', []],
            'Investimentos' => ['#7c3aed', ['Dividendos', 'Rendimentos']],
            'Outras receitas' => ['#64748b', ['Reembolsos', 'Presentes e doações']],
        ],
    ];
}

function seed_default_categories_and_rules(PDO $pdo, string $userId): void
{
    $insertCategory = $pdo->prepare(
        'INSERT INTO categories (id, user_id, name, kind, parent_id, color, icon, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)'
    );

    // categoryIds mapeia "Nome" (raiz) e "Pai > Filha" (subcategoria) para facilitar as regras abaixo.
    $categoryIds = [];
    foreach (default_category_tree() as $kind => $categories) {
        foreach ($categories as $name => [$color, $children]) {
            $parentId = uuid_v4();
            $categoryIds[$name] = $parentId;
            $insertCategory->execute([$parentId, $userId, $name, $kind, null, $color, now_datetime(), now_datetime()]);

            foreach ($children as $childName) {
                $childId = uuid_v4();
                $categoryIds["$name > $childName"] = $childId;
                $insertCategory->execute([$childId, $userId, $childName, $kind, $parentId, $color, now_datetime(), now_datetime()]);
            }
        }
    }

    // Regras padrão de categorização automática (palavras comuns em descrição/beneficiário de extratos BR).
    $defaultRules = [
        ['category' => 'Alimentação > Delivery', 'pattern' => 'IFOOD', 'priority' => 100],
        ['category' => 'Alimentação > Restaurante', 'pattern' => 'RESTAURANTE', 'priority' => 90],
        ['category' => 'Alimentação > Supermercado', 'pattern' => 'MERCADO', 'priority' => 90],
        ['category' => 'Alimentação > Supermercado', 'pattern' => 'SUPERMERCADO', 'priority' => 90],
        ['category' => 'Transporte > Uber e táxi', 'pattern' => 'UBER', 'priority' => 100],
        ['category' => 'Transporte > Uber e táxi', 'pattern' => '99APP', 'priority' => 100],
        ['category' => 'Transporte > Combustível', 'pattern' => 'POSTO', 'priority' => 90],
        ['category' => 'Lazer > Streaming', 'pattern' => 'NETFLIX', 'priority' => 100],
        ['category' => 'Lazer > Streaming', 'pattern' => 'SPOTIFY', 'priority' => 100],
        ['category' => 'Saúde > Farmácia', 'pattern' => 'FARMACIA', 'priority' => 90],
        ['category' => 'Saúde > Academia', 'pattern' => 'ACADEMIA', 'priority' => 90],
        ['category' => 'Moradia > Energia elétrica', 'pattern' => 'ENERGIA', 'priority' => 90],
        ['category' => 'Moradia > Internet', 'pattern' => 'INTERNET', 'priority' => 90],
        ['category' => 'Salário > Salário fixo', 'pattern' => 'SALARIO', 'priority' => 100],
        ['category' => 'Salário > Salário fixo', 'pattern' => 'PAGAMENTO SALARIO', 'priority' => 100],
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
