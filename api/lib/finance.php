<?php

declare(strict_types=1);

/**
 * Resolve a fatura que recebe uma compra em uma determinada data.
 * O ciclo é identificado pelo mês de vencimento.
 */
function card_invoice_dates(array $card, string $purchaseDate): array
{
    $closingDay = min(28, max(1, (int) ($card['closing_day'] ?: 1)));
    $dueDay = min(28, max(1, (int) ($card['due_day'] ?: $closingDay)));
    $purchase = new DateTime($purchaseDate);

    $closing = new DateTime($purchase->format('Y-m') . '-' . str_pad((string) $closingDay, 2, '0', STR_PAD_LEFT));
    if ($purchase > $closing) {
        $closing->modify('+1 month');
    }

    $due = new DateTime($closing->format('Y-m') . '-' . str_pad((string) $dueDay, 2, '0', STR_PAD_LEFT));
    if ($due <= $closing) {
        $due->modify('+1 month');
    }

    return [
        'closingDate' => $closing->format('Y-m-d'),
        'dueDate' => $due->format('Y-m-d'),
        'cycleMonth' => $due->format('Y-m'),
    ];
}

function ensure_card_invoice(PDO $pdo, string $userId, array $card, string $purchaseDate): array
{
    $dates = card_invoice_dates($card, $purchaseDate);
    $stmt = $pdo->prepare('SELECT * FROM credit_card_invoices WHERE account_id = ? AND cycle_month = ?');
    $stmt->execute([$card['id'], $dates['cycleMonth']]);
    $invoice = $stmt->fetch();
    if ($invoice) {
        return $invoice;
    }

    $id = uuid_v4();
    $pdo->prepare(
        'INSERT INTO credit_card_invoices
         (id, user_id, account_id, cycle_month, closing_date, due_date, status, paid_amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, "OPEN", 0, ?, ?)'
    )->execute([
        $id,
        $userId,
        $card['id'],
        $dates['cycleMonth'],
        $dates['closingDate'],
        $dates['dueDate'],
        now_datetime(),
        now_datetime(),
    ]);

    $stmt->execute([$card['id'], $dates['cycleMonth']]);
    return $stmt->fetch();
}

function refresh_invoice_statuses(PDO $pdo, string $userId): void
{
    $pdo->prepare(
        "UPDATE credit_card_invoices i
         SET i.status = CASE
           WHEN i.paid_amount >= (
             SELECT COALESCE(ABS(SUM(t.amount)), 0) FROM transactions t
             WHERE t.invoice_id = i.id AND t.type = 'EXPENSE'
           ) AND (
             SELECT COALESCE(ABS(SUM(t.amount)), 0) FROM transactions t
             WHERE t.invoice_id = i.id AND t.type = 'EXPENSE'
           ) > 0 THEN 'PAID'
           WHEN i.due_date < CURRENT_DATE THEN 'OVERDUE'
           WHEN i.closing_date < CURRENT_DATE THEN 'CLOSED'
           ELSE 'OPEN'
         END,
         i.updated_at = CURRENT_TIMESTAMP
         WHERE i.user_id = ?"
    )->execute([$userId]);
}

function invoice_out(PDO $pdo, array $invoice): array
{
    $stmt = $pdo->prepare(
        "SELECT COALESCE(ABS(SUM(amount)), 0) AS total, COUNT(*) AS item_count
         FROM transactions WHERE invoice_id = ? AND type = 'EXPENSE'"
    );
    $stmt->execute([$invoice['id']]);
    $totals = $stmt->fetch();
    $total = (float) $totals['total'];
    $paid = (float) $invoice['paid_amount'];

    return [
        'id' => $invoice['id'],
        'accountId' => $invoice['account_id'],
        'cycleMonth' => $invoice['cycle_month'],
        'closingDate' => $invoice['closing_date'],
        'dueDate' => $invoice['due_date'],
        'status' => $invoice['status'],
        'total' => $total,
        'paidAmount' => $paid,
        'remainingAmount' => max(0, round($total - $paid, 2)),
        'itemCount' => (int) $totals['item_count'],
        'paidAt' => $invoice['paid_at'],
    ];
}
