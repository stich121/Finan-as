<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/finance.php';

function handle_route(array $segments, string $method): void
{
    $userId = require_login();

    if (empty($segments) && $method === 'GET') {
        cards_list($userId);
        return;
    }
    if (count($segments) === 2 && $segments[1] === 'invoices' && $method === 'GET') {
        cards_invoices($userId, $segments[0]);
        return;
    }
    if (count($segments) === 3 && $segments[1] === 'invoices' && $method === 'GET') {
        cards_invoice_detail($userId, $segments[0], $segments[2]);
        return;
    }
    if (count($segments) === 4 && $segments[1] === 'invoices' && $segments[3] === 'pay' && $method === 'POST') {
        require_csrf();
        cards_pay_invoice($userId, $segments[0], $segments[2]);
        return;
    }

    error_response('Rota de cartões não encontrada.', 404);
}

function cards_find_account(string $userId, string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function cards_list(string $userId): void
{
    $pdo = db();
    refresh_invoice_statuses($pdo, $userId);
    $stmt = $pdo->prepare("SELECT * FROM accounts WHERE user_id = ? AND type = 'CREDIT_CARD' AND archived = 0 ORDER BY name");
    $stmt->execute([$userId]);
    $result = [];

    foreach ($stmt->fetchAll() as $card) {
        $invoiceStmt = $pdo->prepare(
            "SELECT * FROM credit_card_invoices
             WHERE account_id = ? AND status IN ('OPEN','CLOSED','OVERDUE')
             AND EXISTS (SELECT 1 FROM transactions t WHERE t.invoice_id = credit_card_invoices.id AND t.type = 'EXPENSE')
             ORDER BY due_date ASC LIMIT 1"
        );
        $invoiceStmt->execute([$card['id']]);
        $invoice = $invoiceStmt->fetch();
        $used = max(0, -(float) $card['balance']);
        $limit = (float) ($card['credit_limit'] ?? 0);
        $result[] = [
            'id' => $card['id'],
            'name' => $card['name'],
            'institution' => $card['institution'],
            'color' => $card['color'],
            'creditLimit' => $limit,
            'usedLimit' => $used,
            'availableLimit' => max(0, round($limit - $used, 2)),
            'closingDay' => (int) $card['closing_day'],
            'dueDay' => (int) $card['due_day'],
            'currentInvoice' => $invoice ? invoice_out($pdo, $invoice) : null,
        ];
    }

    json_response($result);
}

function cards_invoices(string $userId, string $cardId): void
{
    $card = cards_find_account($userId, $cardId);
    if (!$card || $card['type'] !== 'CREDIT_CARD') {
        error_response('Cartão não encontrado.', 404);
    }
    $pdo = db();
    refresh_invoice_statuses($pdo, $userId);
    $stmt = $pdo->prepare(
        "SELECT * FROM credit_card_invoices
         WHERE account_id = ?
         AND EXISTS (SELECT 1 FROM transactions t WHERE t.invoice_id = credit_card_invoices.id AND t.type = 'EXPENSE')
         ORDER BY due_date DESC LIMIT 24"
    );
    $stmt->execute([$cardId]);
    json_response(array_map(fn($invoice) => invoice_out($pdo, $invoice), $stmt->fetchAll()));
}

function cards_invoice_detail(string $userId, string $cardId, string $invoiceId): void
{
    $pdo = db();
    refresh_invoice_statuses($pdo, $userId);
    $stmt = $pdo->prepare(
        'SELECT i.* FROM credit_card_invoices i
         JOIN accounts a ON a.id = i.account_id
         WHERE i.id = ? AND i.account_id = ? AND i.user_id = ? AND a.type = "CREDIT_CARD"'
    );
    $stmt->execute([$invoiceId, $cardId, $userId]);
    $invoice = $stmt->fetch();
    if (!$invoice) {
        error_response('Fatura não encontrada.', 404);
    }

    $itemsStmt = $pdo->prepare(
        "SELECT t.*, c.name AS category_name FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.invoice_id = ? AND t.type = 'EXPENSE'
         ORDER BY t.date DESC, t.created_at DESC"
    );
    $itemsStmt->execute([$invoiceId]);
    $items = array_map(static fn($t) => [
        'id' => $t['id'],
        'description' => $t['description'],
        'payee' => $t['payee'],
        'categoryName' => $t['category_name'],
        'amount' => abs((float) $t['amount']),
        'date' => $t['date'],
        'status' => $t['status'],
        'installmentNumber' => $t['installment_number'] ? (int) $t['installment_number'] : null,
        'installmentCount' => $t['installment_count'] ? (int) $t['installment_count'] : null,
    ], $itemsStmt->fetchAll());

    json_response(['invoice' => invoice_out($pdo, $invoice), 'items' => $items]);
}

function cards_pay_invoice(string $userId, string $cardId, string $invoiceId): void
{
    $card = cards_find_account($userId, $cardId);
    if (!$card || $card['type'] !== 'CREDIT_CARD') {
        error_response('Cartão não encontrado.', 404);
    }

    $data = read_json_body();
    require_fields($data, ['fromAccountId', 'amount']);
    $from = cards_find_account($userId, (string) $data['fromAccountId']);
    if (!$from || $from['type'] === 'CREDIT_CARD' || $from['id'] === $cardId) {
        error_response('Escolha uma conta válida para pagar a fatura.', 422);
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM credit_card_invoices WHERE id = ? AND account_id = ? AND user_id = ?');
    $stmt->execute([$invoiceId, $cardId, $userId]);
    $invoice = $stmt->fetch();
    if (!$invoice) {
        error_response('Fatura não encontrada.', 404);
    }
    $invoiceData = invoice_out($pdo, $invoice);
    $amount = abs(decimal_amount($data['amount']));
    if ($amount <= 0 || $amount > $invoiceData['remainingAmount'] + 0.009) {
        error_response('O pagamento deve ser maior que zero e não pode ultrapassar o saldo da fatura.', 422);
    }

    $groupId = uuid_v4();
    $date = (string) ($data['date'] ?? (new DateTime('today'))->format('Y-m-d'));
    $now = now_datetime();
    $pdo->beginTransaction();
    try {
        $insert = $pdo->prepare(
            'INSERT INTO transactions
             (id, user_id, account_id, category_id, type, amount, date, description, transfer_account_id, transfer_group_id, source, status, invoice_id, created_at, updated_at)
             VALUES (?, ?, ?, NULL, "TRANSFER", ?, ?, ?, ?, ?, "MANUAL", "CLEARED", ?, ?, ?)'
        );
        $insert->execute([uuid_v4(), $userId, $from['id'], -$amount, $date, 'Pagamento de fatura · ' . $card['name'], $cardId, $groupId, $invoiceId, $now, $now]);
        $insert->execute([uuid_v4(), $userId, $cardId, $amount, $date, 'Pagamento de fatura', $from['id'], $groupId, $invoiceId, $now, $now]);
        $pdo->prepare('UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?')->execute([$amount, $now, $from['id']]);
        $pdo->prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?')->execute([$amount, $now, $cardId]);

        $newPaid = round((float) $invoice['paid_amount'] + $amount, 2);
        $newStatus = $newPaid + 0.009 >= $invoiceData['total'] ? 'PAID' : $invoice['status'];
        $paidAt = $newStatus === 'PAID' ? $now : null;
        $pdo->prepare('UPDATE credit_card_invoices SET paid_amount = ?, status = ?, paid_at = ?, updated_at = ? WHERE id = ?')
            ->execute([$newPaid, $newStatus, $paidAt, $now, $invoiceId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    $stmt->execute([$invoiceId, $cardId, $userId]);
    json_response(invoice_out($pdo, $stmt->fetch()));
}
