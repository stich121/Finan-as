<?php

declare(strict_types=1);

const RULE_MATCH_FIELDS = ['DESCRIPTION', 'PAYEE', 'MEMO'];
const RULE_MATCH_TYPES = ['CONTAINS', 'STARTS_WITH', 'REGEX', 'EQUALS'];

function rule_field_value(array $rule, array $tx): string
{
    $map = ['DESCRIPTION' => 'description', 'PAYEE' => 'payee', 'MEMO' => 'memo'];
    $key = $map[$rule['match_field']] ?? 'description';
    return (string) ($tx[$key] ?? '');
}

function rule_matches(array $rule, array $tx): bool
{
    $haystack = mb_strtoupper(trim(rule_field_value($rule, $tx)), 'UTF-8');
    if ($haystack === '') {
        return false;
    }
    $needle = mb_strtoupper(trim((string) $rule['pattern']), 'UTF-8');
    if ($needle === '') {
        return false;
    }

    switch ($rule['match_type']) {
        case 'CONTAINS':
            return mb_strpos($haystack, $needle) !== false;
        case 'STARTS_WITH':
            return mb_substr($haystack, 0, mb_strlen($needle)) === $needle;
        case 'EQUALS':
            return $haystack === $needle;
        case 'REGEX':
            $delimited = '/' . str_replace('/', '\/', (string) $rule['pattern']) . '/iu';
            $result = @preg_match($delimited, (string) rule_field_value($rule, $tx));
            return $result === 1;
        default:
            return false;
    }
}

/**
 * Retorna o id da categoria sugerida pela primeira regra habilitada que casar
 * (ordenadas por priority desc, created_at asc), ou null se nenhuma casar.
 */
function suggest_category_id(PDO $pdo, string $userId, array $tx): ?string
{
    $stmt = $pdo->prepare(
        'SELECT * FROM category_rules WHERE user_id = ? AND enabled = 1 ORDER BY priority DESC, created_at ASC'
    );
    $stmt->execute([$userId]);
    foreach ($stmt->fetchAll() as $rule) {
        if (rule_matches($rule, $tx)) {
            return $rule['category_id'];
        }
    }
    return null;
}

/**
 * Aprende uma nova regra CONTAINS a partir de uma categorização manual/corrigida pelo usuário.
 * Usa o payee se disponível, senão a descrição, truncado a 60 caracteres.
 */
function learn_rule_from_transaction(PDO $pdo, string $userId, string $categoryId, array $tx): void
{
    $source = trim((string) ($tx['payee'] ?? '')) !== '' ? $tx['payee'] : ($tx['description'] ?? '');
    $pattern = trim(mb_substr((string) $source, 0, 60));
    if ($pattern === '') {
        return;
    }
    $field = trim((string) ($tx['payee'] ?? '')) !== '' ? 'PAYEE' : 'DESCRIPTION';

    $pdo->prepare(
        'INSERT INTO category_rules (id, user_id, category_id, match_field, match_type, pattern, priority, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, "CONTAINS", ?, 200, 1, ?, ?)'
    )->execute([uuid_v4(), $userId, $categoryId, $field, $pattern, now_datetime(), now_datetime()]);
}
