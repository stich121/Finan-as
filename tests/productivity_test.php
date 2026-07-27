<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/lib/productivity.php';

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$noDebt = productivity_debt_projection(0, 20, 100);
assert_true($noDebt['months'] === 0 && $noDebt['payoffPossible'] === true, 'saldo zero deve estar quitado');

$impossible = productivity_debt_projection(1000, 120, 50);
assert_true($impossible['payoffPossible'] === false, 'parcela abaixo dos juros deve ser sinalizada');

$projection = productivity_debt_projection(1000, 12, 100);
assert_true($projection['payoffPossible'] === true, 'projeção comum deve ser possível');
assert_true($projection['months'] > 10 && $projection['months'] < 13, 'prazo projetado deve ser plausível');
assert_true($projection['interest'] > 0, 'juros projetados devem ser positivos');

echo "Productivity projection test: OK\n";
