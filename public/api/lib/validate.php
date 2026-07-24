<?php

require_once __DIR__ . '/response.php';

function require_fields(array $data, array $fields): void
{
    $missing = [];
    foreach ($fields as $field) {
        if (!array_key_exists($field, $data) || $data[$field] === '' || $data[$field] === null) {
            $missing[] = $field;
        }
    }
    if (!empty($missing)) {
        error_response('Campos obrigatórios ausentes: ' . implode(', ', $missing), 422);
    }
}

function require_enum(string $field, $value, array $allowed): void
{
    if (!in_array($value, $allowed, true)) {
        error_response("Valor inválido para \"$field\". Esperado um de: " . implode(', ', $allowed), 422);
    }
}

function is_valid_email(string $email): bool
{
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

function decimal_amount($value): float
{
    if (!is_numeric($value)) {
        error_response('Valor de "amount" inválido.', 422);
    }
    return round((float) $value, 2);
}

function month_string_valid(string $month): bool
{
    return (bool) preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month);
}
