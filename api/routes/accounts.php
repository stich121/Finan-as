<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/finance.php';

const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'CASH', 'INVESTMENT'];

function handle_route(array $segments, string $method): void
{
    $userId = require_login();

    if (empty($segments)) {
        if ($method === 'GET') {
            accounts_list($userId);
            return;
        }
        if ($method === 'POST') {
            require_csrf();
            accounts_create($userId);
            return;
        }
    } elseif (count($segments) === 1) {
        $id = $segments[0];
        if ($method === 'GET') {
            accounts_get($userId, $id);
            return;
        }
        if ($method === 'PATCH') {
            require_csrf();
            accounts_update($userId, $id);
            return;
        }
        if ($method === 'DELETE') {
            require_csrf();
            accounts_delete($userId, $id);
            return;
        }
    } elseif (count($segments) === 2 && $segments[1] === 'adjust-balance' && $method === 'POST') {
        require_csrf();
        accounts_adjust_balance($userId, $segments[0]);
        return;
    } elseif (count($segments) === 2 && $segments[1] === 'pay-invoice' && $method === 'POST') {
        require_csrf();
        accounts_pay_invoice($userId, $segments[0]);
        return;
    }

    error_response('Rota de contas não encontrada.', 404);
}

function accounts_find(string $userId, string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $account = $stmt->fetch();
    return $account ?: null;
}

/**
 * Para cartão de crédito com dia de fechamento configurado, calcula o início do ciclo
 * aberto atual (última data de fechamento) e a data de vencimento da próxima fatura.
 */
function credit_card_cycle_dates(array $account): ?array
{
    if ($account['type'] !== 'CREDIT_CARD' || empty($account['closing_day'])) {
        return null;
    }

    $closingDay = min(28, max(1, (int) $account['closing_day']));
    $today = new DateTime('today');
    $day = (int) $today->format('j');

    $lastClosing = new DateTime($today->format('Y-m') . '-' . str_pad((string) $closingDay, 2, '0', STR_PAD_LEFT));
    if ($day < $closingDay) {
        $lastClosing->modify('-1 month');
    }

    $dueDate = null;
    if (!empty($account['due_day'])) {
        $dueDay = min(28, max(1, (int) $account['due_day']));
        $dueDate = new DateTime($lastClosing->format('Y-m') . '-' . str_pad((string) $dueDay, 2, '0', STR_PAD_LEFT));
        if ($dueDate <= $lastClosing) {
            $dueDate->modify('+1 month');
        }
    }

    return ['cycleStart' => $lastClosing, 'dueDate' => $dueDate];
}

function account_out(array $a): array
{
    $out = [
        'id' => $a['id'],
        'name' => $a['name'],
        'type' => $a['type'],
        'institution' => $a['institution'],
        'balance' => (float) $a['balance'],
        'color' => $a['color'],
        'archived' => (bool) $a['archived'],
        'creditLimit' => isset($a['credit_limit']) ? (float) $a['credit_limit'] : null,
        'closingDay' => isset($a['closing_day']) ? (int) $a['closing_day'] : null,
        'dueDay' => isset($a['due_day']) ? (int) $a['due_day'] : null,
        'currentInvoice' => null,
        'dueDate' => null,
        'availableLimit' => null,
        'createdAt' => $a['created_at'],
        'updatedAt' => $a['updated_at'],
    ];

    if ($a['type'] === 'CREDIT_CARD') {
        $pdo = db();
        refresh_invoice_statuses($pdo, $a['user_id']);
        $stmt = $pdo->prepare(
            "SELECT i.* FROM credit_card_invoices i
             WHERE i.account_id = ? AND i.status IN ('OPEN','CLOSED','OVERDUE')
             AND EXISTS (SELECT 1 FROM transactions t WHERE t.invoice_id = i.id AND t.type = 'EXPENSE')
             ORDER BY i.due_date ASC LIMIT 1"
        );
        $stmt->execute([$a['id']]);
        $invoice = $stmt->fetch();
        if ($invoice) {
            $invoiceData = invoice_out($pdo, $invoice);
            $out['currentInvoice'] = $invoiceData['remainingAmount'];
            $out['dueDate'] = $invoiceData['dueDate'];
        } else {
            $out['currentInvoice'] = 0.0;
        }
        $usedLimit = max(0, -(float) $a['balance']);
        if ($out['creditLimit'] !== null) {
            $out['availableLimit'] = max(0, round($out['creditLimit'] - $usedLimit, 2));
        }
    }

    return $out;
}

function accounts_list(string $userId): void
{
    $includeArchived = isset($_GET['includeArchived']) && $_GET['includeArchived'] !== '0' && $_GET['includeArchived'] !== 'false';
    $sql = 'SELECT * FROM accounts WHERE user_id = ?';
    if (!$includeArchived) {
        $sql .= ' AND archived = 0';
    }
    $sql .= ' ORDER BY archived ASC, name ASC';
    $stmt = db()->prepare($sql);
    $stmt->execute([$userId]);
    json_response(array_map('account_out', $stmt->fetchAll()));
}

function accounts_get(string $userId, string $id): void
{
    $account = accounts_find($userId, $id);
    if (!$account) {
        error_response('Conta não encontrada.', 404);
    }
    json_response(account_out($account));
}

function accounts_create(string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['name', 'type']);
    require_enum('type', $data['type'], ACCOUNT_TYPES);

    $id = uuid_v4();
    $balance = isset($data['balance']) ? decimal_amount($data['balance']) : 0.0;
    $creditLimit = isset($data['creditLimit']) && $data['creditLimit'] !== null ? decimal_amount($data['creditLimit']) : null;
    $closingDay = isset($data['closingDay']) && $data['closingDay'] !== null ? (int) $data['closingDay'] : null;
    $dueDay = isset($data['dueDay']) && $data['dueDay'] !== null ? (int) $data['dueDay'] : null;
    if ($data['type'] === 'CREDIT_CARD') {
        if ($creditLimit === null || $creditLimit <= 0) {
            error_response('Informe um limite maior que zero para o cartão.', 422);
        }
        if ($closingDay === null || $closingDay < 1 || $closingDay > 28 || $dueDay === null || $dueDay < 1 || $dueDay > 28) {
            error_response('Fechamento e vencimento devem ficar entre os dias 1 e 28.', 422);
        }
    }

    db()->prepare(
        'INSERT INTO accounts (id, user_id, name, type, institution, balance, color, archived, credit_limit, closing_day, due_day, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)'
    )->execute([
        $id,
        $userId,
        trim((string) $data['name']),
        $data['type'],
        $data['institution'] ?? null,
        $balance,
        $data['color'] ?? null,
        $creditLimit,
        $closingDay,
        $dueDay,
        now_datetime(),
        now_datetime(),
    ]);

    json_response(account_out(accounts_find($userId, $id)), 201);
}

function accounts_update(string $userId, string $id): void
{
    $account = accounts_find($userId, $id);
    if (!$account) {
        error_response('Conta não encontrada.', 404);
    }
    $data = read_json_body();

    $fields = [
        'name' => $data['name'] ?? $account['name'],
        'type' => $data['type'] ?? $account['type'],
        'institution' => array_key_exists('institution', $data) ? $data['institution'] : $account['institution'],
        'color' => array_key_exists('color', $data) ? $data['color'] : $account['color'],
        'archived' => array_key_exists('archived', $data) ? (int) (bool) $data['archived'] : $account['archived'],
        'credit_limit' => array_key_exists('creditLimit', $data) ? ($data['creditLimit'] !== null ? decimal_amount($data['creditLimit']) : null) : $account['credit_limit'],
        'closing_day' => array_key_exists('closingDay', $data) ? ($data['closingDay'] !== null ? (int) $data['closingDay'] : null) : $account['closing_day'],
        'due_day' => array_key_exists('dueDay', $data) ? ($data['dueDay'] !== null ? (int) $data['dueDay'] : null) : $account['due_day'],
    ];
    require_enum('type', $fields['type'], ACCOUNT_TYPES);
    if ($fields['type'] === 'CREDIT_CARD') {
        if ($fields['credit_limit'] === null || $fields['credit_limit'] <= 0) {
            error_response('Informe um limite maior que zero para o cartão.', 422);
        }
        if ($fields['closing_day'] < 1 || $fields['closing_day'] > 28 || $fields['due_day'] < 1 || $fields['due_day'] > 28) {
            error_response('Fechamento e vencimento devem ficar entre os dias 1 e 28.', 422);
        }
    }

    db()->prepare(
        'UPDATE accounts SET name = ?, type = ?, institution = ?, color = ?, archived = ?, credit_limit = ?, closing_day = ?, due_day = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    )->execute([
        trim((string) $fields['name']),
        $fields['type'],
        $fields['institution'],
        $fields['color'],
        $fields['archived'],
        $fields['credit_limit'],
        $fields['closing_day'],
        $fields['due_day'],
        now_datetime(),
        $id,
        $userId,
    ]);

    json_response(account_out(accounts_find($userId, $id)));
}

function accounts_delete(string $userId, string $id): void
{
    $account = accounts_find($userId, $id);
    if (!$account) {
        error_response('Conta não encontrada.', 404);
    }
    db()->prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?')->execute([$id, $userId]);
    json_response(['ok' => true]);
}

function accounts_adjust_balance(string $userId, string $id): void
{
    $account = accounts_find($userId, $id);
    if (!$account) {
        error_response('Conta não encontrada.', 404);
    }
    $data = read_json_body();
    require_fields($data, ['balance']);
    $newBalance = decimal_amount($data['balance']);
    $diff = round($newBalance - (float) $account['balance'], 2);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        if (abs($diff) >= 0.01) {
            $txId = uuid_v4();
            $type = $diff >= 0 ? 'INCOME' : 'EXPENSE';
            $pdo->prepare(
                'INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, date, description, source, created_at, updated_at)
                 VALUES (?, ?, ?, NULL, ?, ?, ?, "Ajuste de saldo", "MANUAL", ?, ?)'
            )->execute([
                $txId,
                $userId,
                $id,
                $type,
                $diff,
                (new DateTime('today'))->format('Y-m-d'),
                now_datetime(),
                now_datetime(),
            ]);
        }

        $pdo->prepare('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ? AND user_id = ?')
            ->execute([$newBalance, now_datetime(), $id, $userId]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    json_response(account_out(accounts_find($userId, $id)));
}

/**
 * Paga a fatura do cartão: transfere valor de uma conta de origem para o cartão,
 * exatamente como uma transferência normal (duas pernas ligadas por transfer_group_id).
 */
function accounts_pay_invoice(string $userId, string $id): void
{
    $card = accounts_find($userId, $id);
    if (!$card) {
        error_response('Conta não encontrada.', 404);
    }
    if ($card['type'] !== 'CREDIT_CARD') {
        error_response('Essa ação só está disponível para cartões de crédito.', 422);
    }

    $data = read_json_body();
    require_fields($data, ['fromAccountId', 'amount']);
    $fromAccount = accounts_find($userId, $data['fromAccountId']);
    if (!$fromAccount) {
        error_response('Conta de origem não encontrada.', 422);
    }
    $amount = abs(decimal_amount($data['amount']));
    if ($amount <= 0) {
        error_response('Informe um valor maior que zero.', 422);
    }

    $groupId = uuid_v4();
    $legOutId = uuid_v4();
    $legInId = uuid_v4();
    $date = (new DateTime('today'))->format('Y-m-d');

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $insert = $pdo->prepare(
            'INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, date, description, transfer_account_id, transfer_group_id, source, created_at, updated_at)
             VALUES (?, ?, ?, NULL, "TRANSFER", ?, ?, "Pagamento de fatura", ?, ?, "MANUAL", ?, ?)'
        );
        $insert->execute([$legOutId, $userId, $fromAccount['id'], -$amount, $date, $card['id'], $groupId, now_datetime(), now_datetime()]);
        $insert->execute([$legInId, $userId, $card['id'], $amount, $date, $fromAccount['id'], $groupId, now_datetime(), now_datetime()]);

        $pdo->prepare('UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?')->execute([$amount, now_datetime(), $fromAccount['id']]);
        $pdo->prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?')->execute([$amount, now_datetime(), $card['id']]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    json_response(account_out(accounts_find($userId, $id)));
}
