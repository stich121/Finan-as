<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/ofx_parser.php';
require_once __DIR__ . '/../lib/matcher.php';
require_once __DIR__ . '/../lib/finance.php';

const OFX_STAGING_TTL_MINUTES = 30;
const OFX_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function handle_route(array $segments, string $method): void
{
    $userId = require_login();

    if (($segments[0] ?? '') === 'preview' && $method === 'POST') {
        require_csrf();
        ofx_preview($userId);
        return;
    }
    if (($segments[0] ?? '') === 'confirm' && $method === 'POST') {
        require_csrf();
        ofx_confirm($userId);
        return;
    }

    error_response('Rota de importação OFX não encontrada.', 404);
}

function ofx_preview(string $userId): void
{
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        error_response('Envie um arquivo OFX, QFX ou CSV válido no campo "file".', 422);
    }
    $accountId = (string) ($_POST['accountId'] ?? '');
    if ($accountId === '') {
        error_response('Informe a conta de destino (accountId).', 422);
    }

    if ($_FILES['file']['size'] > OFX_MAX_UPLOAD_BYTES) {
        error_response('Arquivo maior que 5MB.', 422);
    }

    $account = db()->prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?');
    $account->execute([$accountId, $userId]);
    if (!$account->fetch()) {
        error_response('Conta não encontrada.', 422);
    }

    $raw = file_get_contents($_FILES['file']['tmp_name']);
    if ($raw === false) {
        error_response('Não foi possível ler o arquivo enviado.', 422);
    }

    try {
        $extension = strtolower(pathinfo((string) $_FILES['file']['name'], PATHINFO_EXTENSION));
        $parsed = $extension === 'csv' ? parse_bank_csv($raw) : parse_ofx_file($raw);
    } catch (Throwable $e) {
        error_response('Erro ao interpretar o OFX: ' . $e->getMessage(), 422);
        return;
    }

    if (empty($parsed)) {
        error_response('Nenhuma transação encontrada no arquivo.', 422);
    }

    $pdo = db();
    $existingFitIds = [];
    $stmt = $pdo->prepare('SELECT fit_id FROM transactions WHERE account_id = ? AND fit_id IS NOT NULL');
    $stmt->execute([$accountId]);
    foreach ($stmt->fetchAll() as $row) {
        $existingFitIds[$row['fit_id']] = true;
    }

    $staged = [];
    $preview = [];
    foreach ($parsed as $tx) {
        $rowId = uuid_v4();
        $isDuplicate = $tx['fitId'] !== null && isset($existingFitIds[$tx['fitId']]);
        $suggestedCategoryId = suggest_category_id($pdo, $userId, [
            'description' => $tx['description'],
            'payee' => $tx['payee'],
            'memo' => $tx['memo'],
        ]);

        $staged[$rowId] = array_merge($tx, ['suggestedCategoryId' => $suggestedCategoryId]);
        $preview[] = array_merge($tx, [
            'rowId' => $rowId,
            'duplicate' => $isDuplicate,
            'suggestedCategoryId' => $suggestedCategoryId,
        ]);
    }

    $stagingId = uuid_v4();
    $expiresAt = (new DateTime('now'))->modify('+' . OFX_STAGING_TTL_MINUTES . ' minutes')->format('Y-m-d H:i:s');
    $pdo->prepare('INSERT INTO ofx_staging (id, user_id, account_id, payload, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$stagingId, $userId, $accountId, json_encode($staged, JSON_UNESCAPED_UNICODE), $expiresAt, now_datetime()]);

    ofx_cleanup_expired();

    json_response([
        'stagingId' => $stagingId,
        'accountId' => $accountId,
        'expiresAt' => $expiresAt,
        'transactions' => $preview,
    ]);
}

function ofx_confirm(string $userId): void
{
    $data = read_json_body();
    require_fields($data, ['stagingId']);

    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM ofx_staging WHERE id = ? AND user_id = ?');
    $stmt->execute([$data['stagingId'], $userId]);
    $staging = $stmt->fetch();

    if (!$staging) {
        error_response('Importação expirada ou não encontrada. Refaça o upload.', 404);
    }
    if (new DateTime($staging['expires_at']) < new DateTime('now')) {
        $pdo->prepare('DELETE FROM ofx_staging WHERE id = ?')->execute([$staging['id']]);
        error_response('Importação expirada. Refaça o upload.', 410);
    }

    $payload = json_decode($staging['payload'], true) ?: [];
    $selectedRowIds = isset($data['rowIds']) && is_array($data['rowIds']) ? $data['rowIds'] : array_keys($payload);
    $categoryOverrides = isset($data['categoryOverrides']) && is_array($data['categoryOverrides']) ? $data['categoryOverrides'] : [];

    $accountId = $staging['account_id'];
    $account = $pdo->prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?');
    $account->execute([$accountId, $userId]);
    $account = $account->fetch();
    if (!$account) {
        error_response('Conta não encontrada.', 422);
    }

    $existingFitIds = [];
    $fitStmt = $pdo->prepare('SELECT fit_id FROM transactions WHERE account_id = ? AND fit_id IS NOT NULL');
    $fitStmt->execute([$accountId]);
    foreach ($fitStmt->fetchAll() as $row) {
        $existingFitIds[$row['fit_id']] = true;
    }

    $insert = $pdo->prepare(
        'INSERT IGNORE INTO transactions (id, user_id, account_id, category_id, type, amount, date, description, payee, memo, fit_id, source, status, invoice_id, purchase_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "OFX", "CLEARED", ?, ?, ?, ?)'
    );

    $pdo->beginTransaction();
    $imported = 0;
    $totalDelta = 0.0;
    try {
        foreach ($selectedRowIds as $rowId) {
            if (!isset($payload[$rowId])) {
                continue;
            }
            $tx = $payload[$rowId];
            if ($tx['fitId'] !== null && isset($existingFitIds[$tx['fitId']])) {
                continue; // duplicado, ignora
            }

            $categoryId = $categoryOverrides[$rowId] ?? $tx['suggestedCategoryId'] ?? null;
            $invoiceId = null;
            if ($account['type'] === 'CREDIT_CARD' && $tx['type'] === 'EXPENSE') {
                $invoiceId = ensure_card_invoice($pdo, $userId, $account, $tx['date'])['id'];
            }
            $insert->execute([
                uuid_v4(),
                $userId,
                $accountId,
                $categoryId,
                $tx['type'],
                $tx['amount'],
                $tx['date'],
                $tx['description'],
                $tx['payee'],
                $tx['memo'],
                $tx['fitId'],
                $invoiceId,
                $account['type'] === 'CREDIT_CARD' ? $tx['date'] : null,
                now_datetime(),
                now_datetime(),
            ]);
            $imported++;
            $totalDelta += (float) $tx['amount'];
            if ($tx['fitId'] !== null) {
                $existingFitIds[$tx['fitId']] = true;
            }
        }

        if (abs($totalDelta) >= 0.01) {
            $pdo->prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE id = ?')
                ->execute([round($totalDelta, 2), now_datetime(), $accountId]);
        }

        $pdo->prepare('DELETE FROM ofx_staging WHERE id = ?')->execute([$staging['id']]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    json_response(['ok' => true, 'imported' => $imported]);
}

function ofx_cleanup_expired(): void
{
    db()->prepare('DELETE FROM ofx_staging WHERE expires_at < NOW()')->execute();
}
