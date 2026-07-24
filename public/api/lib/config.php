<?php

function app_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $path = __DIR__ . '/../config.php';
    if (!file_exists($path)) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'error' => 'Configuração ausente. Copie public/api/config.example.php para public/api/config.php e preencha os dados do banco.',
        ]);
        exit;
    }

    $config = require $path;
    return $config;
}

function is_production(): bool
{
    return (app_config()['env'] ?? 'production') === 'production';
}
