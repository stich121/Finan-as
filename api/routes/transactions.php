<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/matcher.php';
require_once __DIR__ . '/../lib/finance.php';

const TX_TYPES = ['INCOME', 'EXPENSE', 'TRANSFER'];
const TX_STATUSES = ['PENDING', 'CLEARED'];

function handle_route(array $segments, string $method): void
{
    $userId = require_login();

    if (empty($segments)) {
        if ($method === 'GET') {
            transactions_list($userId);
            return;
        }
        if ($method === 'POST') {
            require_csrf();
            transactions_create($userId);
            return;
        }
    } elseif (count($segments) === 1 && $segments[0] === 'bulk-categorize' && $method === 'POST') {
        require_csrf();
        transactions_bulk_categorize($userId);
        return;
    } elseif (count($segments) === 1) {
        $id = $segments[0];
        if ($method === 'GET') {
            transactions_get($userId, $id);
            return;
        }
        if ($method === 'PATCH') {
            require_csrf();
            transactions_update($userId, $id);
            return;
        }
        if ($method === 'DELETE') {
            require_csrf();
            transactions_delete($userId, $id);
            return;
        }
    } elseif (count($segments) === 2 && $segments[1] === 'categorize' && $method === 'POST') {
        require_csrf();
        transactions_categorize_one($userId, $segments[0]);
        return;
    }

    error_response('Rota de transações não encontrada.', 404);
}

function tx_find_account(string $userId, string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function tx_find(string $userId, string $id): ?array
{
    $stmt = db()->prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function tx_affects_balance(array $account, string $status): bool
{
    return $account['type'] === 'CREDIT_CARD' || $status === 'CLEARED';
}

function tx_tags_for(array $ids): array
{
    if (empty($ids)) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = db()->prepare(
        "SELECT tt.transaction_id, t.id, t.name, t.color FROM transaction_tags tt
         JOIN tags t ON t.id = tt.tag_id WHERE tt.transaction_id IN ($placeholders)"
    );
    $stmt->execute($ids);
    $byTx = [];
    foreach ($stmt->fetchAll() as $row) {
        $byTx[$row['transaction_id']][] = ['id' => $row['id'], 'name' => $row['name'], 'color' => $row['color']];
    }
    return $byTx;
}

function tx_out(array $t, array $tagsByTx = []): array
{
    return [
        'id' => $t['id'],
        'accountId' => $t['account_id'],
        'categoryId' => $t['category_id'],
        'type' => $t['type'],
        'amount' => (float) $t['amount'],
        'date' => $t['date'],
        'description' => $t['description'],
        'payee' => $t['payee'],
        'memo' => $t['memo'],
        'fitId' => $t['fit_id'],
        'transferAccountId' => $t['transfer_account_id'],
        'transferGroupId' => $t['transfer_group_id'],
        'source' => $t['source'],
        'status' => $t['status'] ?? 'CLEARED',
        'invoiceId' => $t['invoice_id'] ?? null,
        'installmentGroupId' => $t['installment_group_id'] ?? null,
        'installmentNumber' => isset($t['installment_number']) ? (int) $t['installment_number'] : null,
        'installmentCount' => isset($t['installment_count']) ? (int) $t['installment_count'] : null,
        'purchaseDate' => $t['purchase_date'] ?? null,
        'tags' => $tagsByTx[$t['id']] ?? [],
        'createdAt' => $t['created_at'],
    ];
}

function transactions_list(string $userId): void
{
    $where = ['user_id = ?'];
    $params = [$userId];

    if (!empty($_GET['accountId'])) {
        $where[] = 'account_id = ?';
        $params[] = $_GET['accountId'];
    }
    if (!empty($_GET['categoryId'])) {
        $where[] = 'category_id = ?';
        $params[] = $_GET['categoryId'];
    }
    if (!empty($_GET['type'])) {
        require_enum('type', $_GET['type'], TX_TYPES);
        $where[] = 'type = ?';
        $params[] = $_GET['type'];
    }
    if (!empty($_GET['status'])) {
        require_enum('status', $_GET['status'], TX_STATUSES);
        $where[] = 'status = ?';
        $params[] = $_GET['status'];
    }
    if (!empty($_GET['uncategorizedOnly']) && $_GET['uncategorizedOnly'] !== '0') {
        $where[] = 'category_id IS NULL';
    }
    if (!empty($_GET['dateFrom'])) {
        $where[] = 'date >= ?';
        $params[] = $_GET['dateFrom'];
    }
    if (!empty($_GET['dateTo'])) {
        $where[] = 'date <= ?';
        $params[] = $_GET['dateTo'];
    }
    if (!empty($_GET['search'])) {
        $where[] = '(description LIKE ? OR payee LIKE ? OR memo LIKE ?)';
        $term = '%' . $_GET['search'] . '%';
        array_push($params, $term, $term, $term);
    }

    $page = max(1, (int) ($_GET['page'] ?? 1));
    $pageSize = min(200, max(1, (int) ($_GET['pageSize'] ?? 50)));
    $offset = ($page - 1) * $pageSize;

    $whereSql = implode(' AND ', $where);
    $pdo = db();

    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE $whereSql");
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();

    $stmt = $pdo->prepare(
        "SELECT * FROM transactions WHERE $whereSql ORDER BY date DESC, created_at DESC LIMIT $pageSize OFFSET $offset"
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $tagsByTx = tx_tags_for(array_column($rows, 'id'));

    json_response([
        'items' => array_map(fn($r) => tx_out($r, $tagsByTx), $rows),
        'total' => $total,
        'page' => $page,
        'pageSize' => $pageSize,
    ]);
}

function transactions_get(string $userId, string $id): void
{
    $tx = tx_find($userId, $id);
    if (!$tx) {
        error_response('Transação não encontrada.', 404);
    }
    $tagsByTx = tx_tags_for([$id]);
    json_response(tx_out($tx, $tagsByTx));
}

function transactions_create(string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['accountId', 'type', 'amount', 'date']);
    require_enum('type', $data['type'], TX_TYPES);

    $account = tx_find_account($userId, $data['accountId']);
    if (!$account) {
        error_response('Conta não encontrada.', 422);
    }

    $amount = decimal_amount($data['amount']);
    $date = (string) $data['date'];
    $description = $data['description'] ?? null;
    $payee = $data['payee'] ?? null;
    $memo = $data['memo'] ?? null;
    $status = (string) ($data['status'] ?? 'CLEARED');
    require_enum('status', $status, TX_STATUSES);

    $pdo = db();

    if ($data['type'] === 'TRANSFER') {
        require_fields($data, ['transferAccountId']);
        $destAccount = tx_find_account($userId, $data['transferAccountId']);
        if (!$destAccount) {
            error_response('Conta de destino não encontrada.', 422);
        }
        if ($destAccount['id'] === $account['id']) {
            error_response('A conta de origem e destino não podem ser a mesma.', 422);
        }

        $absAmount = abs($amount);
        $groupId = uuid_v4();
        $legOutId = uuid_v4();
        $legInId = uuid_v4();

        $pdo->beginTransaction();
        try {
            $insert = $pdo->prepare(
                'INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, date, description, payee, memo, transfer_account_id, transfer_group_id, source, created_at, updated_at)
                 VALUES (?, ?, ?, NULL, "TRANSFER", ?, ?, ?, ?, ?, ?, ?, "MANUAL", ?, ?)'
            );
            $insert->execute([$legOutId, $userId, $account['id'], -$absAmount, $date, $description, $payee, $memo, $destAccount['id'], $groupId, now_datetime(), now_datetime()]);
            $insert->execute([$legInId, $userId, $destAccount['id'], $absAmount, $date, $description, $payee, $memo, $account['id'], $groupId, now_datetime(), now_datetime()]);

            $pdo->prepare('UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?')->execute([$absAmount, now_datetime(), $account['id']]);
            $pdo->prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?')->execute([$absAmount, now_datetime(), $destAccount['id']]);

            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        json_response(tx_out(tx_find($userId, $legOutId)), 201);
        return;
    }

    $signedAmount = $data['type'] === 'EXPENSE' ? -abs($amount) : abs($amount);
    $categoryId = $data['categoryId'] ?? null;
    if (!$categoryId) {
        $categoryId = suggest_category_id($pdo, $userId, [
            'description' => $description,
            'payee' => $payee,
            'memo' => $memo,
        ]);
    }

    $installmentCount = max(1, min(60, (int) ($data['installmentCount'] ?? 1)));
    if ($installmentCount > 1 && ($data['type'] !== 'EXPENSE' || $account['type'] !== 'CREDIT_CARD')) {
        error_response('Parcelamento está disponível apenas para despesas no cartão de crédito.', 422);
    }

    $id = uuid_v4();
    $installmentGroupId = null;
    $pdo->beginTransaction();
    try {
        if ($data['type'] === 'EXPENSE' && $account['type'] === 'CREDIT_CARD') {
            $groupId = $installmentCount > 1 ? uuid_v4() : null;
            $installmentGroupId = $groupId;
            $totalCents = (int) round(abs($amount) * 100);
            $baseCents = intdiv($totalCents, $installmentCount);
            $remainder = $totalCents % $installmentCount;
            $purchase = new DateTime($date);
            $insert = $pdo->prepare(
                'INSERT INTO transactions
                 (id, user_id, account_id, category_id, type, amount, date, description, payee, memo, source, status, invoice_id, installment_group_id, installment_number, installment_count, purchase_date, created_at, updated_at)
                 VALUES (?, ?, ?, ?, "EXPENSE", ?, ?, ?, ?, ?, "MANUAL", ?, ?, ?, ?, ?, ?, ?, ?)'
            );

            for ($i = 1; $i <= $installmentCount; $i++) {
                $installmentDate = clone $purchase;
                if ($i > 1) {
                    $installmentDate->modify('first day of +' . ($i - 1) . ' month');
                    $installmentDate->setDate(
                        (int) $installmentDate->format('Y'),
                        (int) $installmentDate->format('m'),
                        min(28, (int) $purchase->format('d'))
                    );
                }
                $invoice = ensure_card_invoice($pdo, $userId, $account, $installmentDate->format('Y-m-d'));
                $partCents = $baseCents + ($i <= $remainder ? 1 : 0);
                $partAmount = -($partCents / 100);
                $partId = $i === 1 ? $id : uuid_v4();
                $partStatus = $i === 1 ? $status : 'PENDING';
                $partDescription = $installmentCount > 1
                    ? trim((string) ($description ?: $payee ?: 'Compra parcelada')) . " ($i/$installmentCount)"
                    : $description;
                $insert->execute([
                    $partId, $userId, $account['id'], $categoryId, $partAmount,
                    $installmentDate->format('Y-m-d'), $partDescription, $payee, $memo,
                    $partStatus, $invoice['id'], $groupId,
                    $installmentCount > 1 ? $i : null,
                    $installmentCount > 1 ? $installmentCount : null,
                    $date, now_datetime(), now_datetime(),
                ]);
            }
        } else {
            $pdo->prepare(
                'INSERT INTO transactions
                 (id, user_id, account_id, category_id, type, amount, date, description, payee, memo, source, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "MANUAL", ?, ?, ?)'
            )->execute([$id, $userId, $account['id'], $categoryId, $data['type'], $signedAmount, $date, $description, $payee, $memo, $status, now_datetime(), now_datetime()]);
        }

        if (tx_affects_balance($account, $status)) {
            $pdo->prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?')
                ->execute([$signedAmount, now_datetime(), $account['id']]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    if ($installmentGroupId) {
        $tagStmt = $pdo->prepare('SELECT id FROM transactions WHERE installment_group_id = ? AND user_id = ?');
        $tagStmt->execute([$installmentGroupId, $userId]);
        foreach ($tagStmt->fetchAll() as $part) {
            transactions_sync_tags($part['id'], $data['tagIds'] ?? []);
        }
    } else {
        transactions_sync_tags($id, $data['tagIds'] ?? []);
    }
    json_response(tx_out(tx_find($userId, $id), tx_tags_for([$id])), 201);
}

function transactions_sync_tags(string $txId, array $tagIds): void
{
    $pdo = db();
    $pdo->prepare('DELETE FROM transaction_tags WHERE transaction_id = ?')->execute([$txId]);
    if (empty($tagIds)) {
        return;
    }
    $insert = $pdo->prepare('INSERT IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)');
    foreach ($tagIds as $tagId) {
        $insert->execute([$txId, $tagId]);
    }
}

function transactions_update(string $userId, string $id): void
{
    $tx = tx_find($userId, $id);
    if (!$tx) {
        error_response('Transação não encontrada.', 404);
    }
    if ($tx['type'] === 'TRANSFER') {
        error_response('Transferências não podem ser editadas. Exclua e crie uma nova.', 422);
    }
    if (!empty($tx['installment_group_id'])) {
        error_response('Para alterar uma compra parcelada, exclua as parcelas e lance a compra novamente.', 422);
    }

    $data = read_json_body();
    $type = $data['type'] ?? $tx['type'];
    require_enum('type', $type, ['INCOME', 'EXPENSE']);

    $newAccount = isset($data['accountId']) ? tx_find_account($userId, $data['accountId']) : tx_find_account($userId, $tx['account_id']);
    if (!$newAccount) {
        error_response('Conta não encontrada.', 422);
    }

    $amount = isset($data['amount']) ? decimal_amount($data['amount']) : abs((float) $tx['amount']);
    $newSignedAmount = $type === 'EXPENSE' ? -abs($amount) : abs($amount);

    $fields = [
        'category_id' => array_key_exists('categoryId', $data) ? $data['categoryId'] : $tx['category_id'],
        'date' => $data['date'] ?? $tx['date'],
        'description' => array_key_exists('description', $data) ? $data['description'] : $tx['description'],
        'payee' => array_key_exists('payee', $data) ? $data['payee'] : $tx['payee'],
        'memo' => array_key_exists('memo', $data) ? $data['memo'] : $tx['memo'],
        'status' => array_key_exists('status', $data) ? $data['status'] : ($tx['status'] ?? 'CLEARED'),
    ];
    require_enum('status', $fields['status'], TX_STATUSES);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $newInvoiceId = null;
        if ($type === 'EXPENSE' && $newAccount['type'] === 'CREDIT_CARD') {
            $newInvoiceId = ensure_card_invoice($pdo, $userId, $newAccount, $fields['date'])['id'];
        }
        $oldSignedAmount = (float) $tx['amount'];
        $accountChanged = $newAccount['id'] !== $tx['account_id'];
        $oldAccount = tx_find_account($userId, $tx['account_id']);
        $oldAffects = $oldAccount ? tx_affects_balance($oldAccount, $tx['status'] ?? 'CLEARED') : false;
        $newAffects = tx_affects_balance($newAccount, $fields['status']);

        if ($accountChanged) {
            if ($oldAffects) {
                $pdo->prepare('UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?')
                    ->execute([$oldSignedAmount, now_datetime(), $tx['account_id']]);
            }
            if ($newAffects) {
                $pdo->prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?')
                    ->execute([$newSignedAmount, now_datetime(), $newAccount['id']]);
            }
        } else {
            $oldContribution = $oldAffects ? $oldSignedAmount : 0.0;
            $newContribution = $newAffects ? $newSignedAmount : 0.0;
            $diff = round($newContribution - $oldContribution, 2);
            if (abs($diff) >= 0.01) {
                $pdo->prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?')
                    ->execute([$diff, now_datetime(), $newAccount['id']]);
            }
        }

        $pdo->prepare(
            'UPDATE transactions SET account_id = ?, category_id = ?, type = ?, amount = ?, date = ?, description = ?, payee = ?, memo = ?, status = ?, invoice_id = ?, purchase_date = ?, updated_at = ?
             WHERE id = ? AND user_id = ?'
        )->execute([
            $newAccount['id'],
            $fields['category_id'],
            $type,
            $newSignedAmount,
            $fields['date'],
            $fields['description'],
            $fields['payee'],
            $fields['memo'],
            $fields['status'],
            $newInvoiceId,
            $newInvoiceId ? $fields['date'] : null,
            now_datetime(),
            $id,
            $userId,
        ]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    if (array_key_exists('tagIds', $data)) {
        transactions_sync_tags($id, $data['tagIds']);
    }

    json_response(tx_out(tx_find($userId, $id), tx_tags_for([$id])));
}

function transactions_delete(string $userId, string $id): void
{
    $tx = tx_find($userId, $id);
    if (!$tx) {
        error_response('Transação não encontrada.', 404);
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        if (!empty($tx['installment_group_id'])) {
            $stmt = $pdo->prepare('SELECT * FROM transactions WHERE installment_group_id = ? AND user_id = ?');
            $stmt->execute([$tx['installment_group_id'], $userId]);
            $parts = $stmt->fetchAll();
            $total = array_sum(array_map(static fn($part) => (float) $part['amount'], $parts));
            $pdo->prepare('UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?')
                ->execute([$total, now_datetime(), $tx['account_id']]);
            $pdo->prepare('DELETE FROM transactions WHERE installment_group_id = ? AND user_id = ?')
                ->execute([$tx['installment_group_id'], $userId]);
        } elseif ($tx['type'] === 'TRANSFER' && $tx['transfer_group_id']) {
            $stmt = $pdo->prepare('SELECT * FROM transactions WHERE transfer_group_id = ? AND user_id = ?');
            $stmt->execute([$tx['transfer_group_id'], $userId]);
            $legs = $stmt->fetchAll();
            foreach ($legs as $leg) {
                $pdo->prepare('UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?')
                    ->execute([(float) $leg['amount'], now_datetime(), $leg['account_id']]);
            }
            $pdo->prepare('DELETE FROM transactions WHERE transfer_group_id = ? AND user_id = ?')->execute([$tx['transfer_group_id'], $userId]);
        } else {
            $account = tx_find_account($userId, $tx['account_id']);
            if ($account && tx_affects_balance($account, $tx['status'] ?? 'CLEARED')) {
                $pdo->prepare('UPDATE accounts SET balance = balance - ?, updated_at = ? WHERE id = ?')
                    ->execute([(float) $tx['amount'], now_datetime(), $tx['account_id']]);
            }
            $pdo->prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?')->execute([$id, $userId]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    json_response(['ok' => true]);
}

function transactions_categorize_one(string $userId, string $id): void
{
    $tx = tx_find($userId, $id);
    if (!$tx) {
        error_response('Transação não encontrada.', 404);
    }
    $data = read_json_body();
    require_fields($data, ['categoryId']);

    $pdo = db();
    $pdo->prepare('UPDATE transactions SET category_id = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        ->execute([$data['categoryId'], now_datetime(), $id, $userId]);

    if (!empty($data['createRule'])) {
        learn_rule_from_transaction($pdo, $userId, $data['categoryId'], $tx);
    }

    json_response(tx_out(tx_find($userId, $id), tx_tags_for([$id])));
}

function transactions_bulk_categorize(string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['ids', 'categoryId']);
    if (!is_array($data['ids']) || empty($data['ids'])) {
        error_response('Informe ao menos um id de transação.', 422);
    }

    $pdo = db();
    $placeholders = implode(',', array_fill(0, count($data['ids']), '?'));
    $params = array_merge([$data['categoryId'], now_datetime()], $data['ids'], [$userId]);
    $pdo->prepare("UPDATE transactions SET category_id = ?, updated_at = ? WHERE id IN ($placeholders) AND user_id = ?")
        ->execute($params);

    if (!empty($data['createRule'])) {
        $stmt = $pdo->prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?');
        $stmt->execute([$data['ids'][0], $userId]);
        $sample = $stmt->fetch();
        if ($sample) {
            learn_rule_from_transaction($pdo, $userId, $data['categoryId'], $sample);
        }
    }

    json_response(['ok' => true, 'updated' => count($data['ids'])]);
}
