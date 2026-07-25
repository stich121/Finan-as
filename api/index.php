<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/config.php';
require_once __DIR__ . '/lib/response.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/validate.php';

if (!is_production()) {
    error_reporting(E_ALL);
    ini_set('display_errors', '0'); // nunca imprimir HTML de erro em respostas JSON
}

start_app_session();

set_exception_handler(function (Throwable $e): void {
    error_log('[financas-api] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $extra = is_production() ? [] : ['detail' => $e->getMessage()];
    error_response('Erro interno do servidor.', 500, $extra);
});

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$segments = array_values(array_filter(explode('/', trim($requestPath, '/'))));

// Remove o prefixo "api" (o front controller pode ser alcançado via /api/... ou diretamente)
if (!empty($segments) && $segments[0] === 'api') {
    array_shift($segments);
}

$resource = $segments[0] ?? '';
$rest = array_slice($segments, 1);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Requisições GET só leem a sessão. Liberar o lock aqui permite que telas como
// o dashboard executem resumo, tendência e previsão realmente em paralelo.
// Os dados já carregados permanecem disponíveis em $_SESSION após o fechamento.
if ($method === 'GET' && session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$routes = [
    'auth' => 'auth.php',
    'accounts' => 'accounts.php',
    'categories' => 'categories.php',
    'tags' => 'tags.php',
    'transactions' => 'transactions.php',
    'rules' => 'rules.php',
    'budgets' => 'budgets.php',
    'recurring' => 'recurring.php',
    'dashboard' => 'dashboard.php',
    'ofx' => 'ofx.php',
    'goals' => 'goals.php',
    'cards' => 'cards.php',
    'reports' => 'reports.php',
];

if ($resource === '' || !isset($routes[$resource])) {
    error_response('Rota não encontrada.', 404);
}

require __DIR__ . '/routes/' . $routes[$resource];

if (!function_exists('handle_route')) {
    error_response('Rota não implementada.', 501);
}

handle_route($rest, $method);
