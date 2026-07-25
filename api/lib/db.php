<?php

require_once __DIR__ . '/config.php';

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $config = app_config();
    $dbHost = trim((string) ($config['db_host'] ?? ''));
    // Em hospedagens Linux, "localhost" faz o PDO tentar um socket Unix. Na
    // Hostinger esse socket pode não existir no caminho padrão do PHP, causando
    // SQLSTATE[HY000] [2002]. O IP força a conexão TCP com o MySQL local.
    if ($dbHost === '' || strcasecmp($dbHost, 'localhost') === 0) {
        $dbHost = '127.0.0.1';
    }
    $dbPort = max(1, (int) ($config['db_port'] ?? 3306));
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $dbHost,
        $dbPort,
        $config['db_name']
    );

    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);

    return $pdo;
}

function uuid_v4(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function now_datetime(): string
{
    return (new DateTime('now'))->format('Y-m-d H:i:s');
}

function db_table_exists(PDO $pdo, string $table): bool
{
    static $cache = [];
    $key = 'table:' . $table;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }

    try {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = ?'
        );
        $stmt->execute([$table]);
        return $cache[$key] = (bool) $stmt->fetchColumn();
    } catch (Throwable $e) {
        error_log('[financas-schema] Falha ao consultar tabela ' . $table . ': ' . $e->getMessage());
        return $cache[$key] = false;
    }
}

function db_column_exists(PDO $pdo, string $table, string $column): bool
{
    static $cache = [];
    $key = $table . ':' . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }

    try {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?'
        );
        $stmt->execute([$table, $column]);
        return $cache[$key] = (bool) $stmt->fetchColumn();
    } catch (Throwable $e) {
        error_log('[financas-schema] Falha ao consultar coluna ' . $table . '.' . $column . ': ' . $e->getMessage());
        return $cache[$key] = false;
    }
}
