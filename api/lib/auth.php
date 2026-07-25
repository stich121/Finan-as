<?php

require_once __DIR__ . '/response.php';

function start_app_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 30, // 30 dias
        'path' => '/',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_name('financas_sid');
    session_start();
}

function current_user_id(): ?string
{
    return $_SESSION['user_id'] ?? null;
}

function require_login(): string
{
    $userId = current_user_id();
    if (!$userId) {
        error_response('Não autenticado.', 401);
    }
    return $userId;
}

function login_user(string $userId): void
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

function logout_user(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();
}

function current_csrf_token(): ?string
{
    // Sessões criadas antes da adoção do CSRF não possuem o token. Gerá-lo
    // preguiçosamente mantém essas sessões válidas sem exigir novo login.
    if (!isset($_SESSION['csrf_token']) && current_user_id()) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'] ?? null;
}

function require_csrf(): void
{
    $expected = current_csrf_token();
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$expected || !$provided || !hash_equals($expected, $provided)) {
        error_response('Token CSRF inválido ou ausente.', 403);
    }
}
