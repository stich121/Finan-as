<?php

declare(strict_types=1);

/**
 * Parser de arquivos OFX/QFX (extrato bancário). Suporta tanto OFX 1.x (SGML, sem
 * fechamento de tags) quanto OFX 2.x/XML. Detecta o charset declarado no cabeçalho
 * (comum em bancos brasileiros usar Windows-1252/ISO-8859-1) e normaliza para UTF-8.
 *
 * Retorna um array de transações: ['fitId','date' (Y-m-d),'amount' (float, sinal original),
 * 'type' ('INCOME'|'EXPENSE'), 'description','payee','memo'].
 */
function parse_ofx_file(string $raw): array
{
    $raw = strip_utf8_bom($raw);
    $sourceEncoding = detect_ofx_encoding($raw);
    if ($sourceEncoding !== 'UTF-8') {
        $converted = @iconv($sourceEncoding, 'UTF-8//IGNORE', $raw);
        if ($converted !== false) {
            $raw = $converted;
        }
    }

    // Remove processing instructions (ex.: a diretiva OFX no topo do arquivo) antes da tag <OFX>.
    $raw = preg_replace('/<\?[^>]*\?>/', '', $raw) ?? $raw;

    $ofxStart = stripos($raw, '<OFX>');
    if ($ofxStart === false) {
        throw new RuntimeException('Arquivo não parece ser um OFX válido (tag <OFX> não encontrada).');
    }
    $body = substr($raw, $ofxStart);

    // Normaliza SGML -> XML: fecha tags de valor simples que não têm fechamento explícito.
    // Ex: "<NAME>MERCADO XYZ\n" vira "<NAME>MERCADO XYZ</NAME>\n". Tags já fechadas (contêm '<'
    // antes da quebra de linha) não são tocadas por causa do [^<]+.
    $normalized = preg_replace('/<([A-Za-z0-9.]+)>([^<\r\n]+)\r?\n/', "<\$1>\$2</\$1>\n", $body) ?? $body;
    $normalized = '<XMLROOT>' . $normalized . '</XMLROOT>';

    libxml_use_internal_errors(true);
    $xml = simplexml_load_string($normalized, 'SimpleXMLElement', LIBXML_NOCDATA);
    if ($xml === false) {
        $errors = array_map(fn($e) => trim($e->message), libxml_get_errors());
        libxml_clear_errors();
        throw new RuntimeException('Falha ao interpretar o OFX: ' . implode('; ', array_slice($errors, 0, 3)));
    }

    $nodes = $xml->xpath('//STMTTRN') ?: [];
    $transactions = [];
    foreach ($nodes as $node) {
        $trnAmt = isset($node->TRNAMT) ? (float) str_replace(',', '.', (string) $node->TRNAMT) : 0.0;
        $dtPosted = (string) ($node->DTPOSTED ?? '');
        $date = ofx_parse_date($dtPosted);
        if ($date === null) {
            continue;
        }

        $name = trim((string) ($node->NAME ?? ''));
        $payee = trim((string) ($node->PAYEE ?? ''));
        $memo = trim((string) ($node->MEMO ?? ''));
        $fitId = trim((string) ($node->FITID ?? ''));

        $transactions[] = [
            'fitId' => $fitId !== '' ? $fitId : null,
            'date' => $date,
            'amount' => round($trnAmt, 2),
            'type' => $trnAmt < 0 ? 'EXPENSE' : 'INCOME',
            'description' => $name !== '' ? $name : ($payee !== '' ? $payee : $memo),
            'payee' => $payee !== '' ? $payee : ($name !== '' ? $name : null),
            'memo' => $memo !== '' ? $memo : null,
        ];
    }

    return $transactions;
}

function strip_utf8_bom(string $raw): string
{
    if (substr($raw, 0, 3) === "\xEF\xBB\xBF") {
        return substr($raw, 3);
    }
    return $raw;
}

function detect_ofx_encoding(string $raw): string
{
    $head = substr($raw, 0, 1024);

    if (preg_match('/encoding="([^"]+)"/i', $head, $m)) {
        return normalize_encoding_name($m[1]);
    }
    if (preg_match('/CHARSET:\s*([A-Za-z0-9\-]+)/i', $head, $m)) {
        return normalize_encoding_name($m[1]);
    }

    return 'UTF-8';
}

function normalize_encoding_name(string $name): string
{
    $name = strtoupper(trim($name));
    return match (true) {
        str_contains($name, '1252') => 'Windows-1252',
        str_contains($name, '8859-1'), str_contains($name, 'LATIN1'), str_contains($name, 'ISO-8859') => 'ISO-8859-1',
        str_contains($name, 'UTF-8'), str_contains($name, 'UTF8') => 'UTF-8',
        default => 'Windows-1252', // fallback comum para OFX de bancos brasileiros sem charset explícito confiável
    };
}

function ofx_parse_date(string $raw): ?string
{
    // Formato OFX: YYYYMMDD[HHMMSS[.XXX]][ [+-]TZ[:TZNAME]]
    if (!preg_match('/^(\d{4})(\d{2})(\d{2})/', $raw, $m)) {
        return null;
    }
    [$_, $y, $mo, $d] = $m;
    if (!checkdate((int) $mo, (int) $d, (int) $y)) {
        return null;
    }
    return sprintf('%04d-%02d-%02d', $y, $mo, $d);
}

/**
 * Parser de CSV bancário com detecção de separador e nomes de colunas comuns no Brasil.
 * Colunas mínimas: data, descrição/histórico e valor (ou débito/crédito).
 */
function parse_bank_csv(string $raw): array
{
    $raw = strip_utf8_bom($raw);
    if (@preg_match('//u', $raw) !== 1) {
        $converted = @iconv('Windows-1252', 'UTF-8//IGNORE', $raw);
        if ($converted !== false) {
            $raw = $converted;
        }
    }
    $lines = preg_split('/\r\n|\r|\n/', trim($raw)) ?: [];
    if (count($lines) < 2) {
        throw new RuntimeException('CSV vazio ou sem linhas de transação.');
    }

    $first = $lines[0];
    $counts = [';' => substr_count($first, ';'), ',' => substr_count($first, ','), "\t" => substr_count($first, "\t")];
    arsort($counts);
    $delimiter = (string) array_key_first($counts);
    $headers = array_map('csv_normalize_header', str_getcsv(array_shift($lines), $delimiter));

    $find = static function (array $names) use ($headers): ?int {
        foreach ($names as $name) {
            $index = array_search($name, $headers, true);
            if ($index !== false) {
                return (int) $index;
            }
        }
        return null;
    };

    $dateIndex = $find(['data', 'date', 'data_lancamento', 'data_movimento']);
    $descriptionIndex = $find(['descricao', 'historico', 'description', 'lancamento', 'detalhes']);
    $payeeIndex = $find(['beneficiario', 'favorecido', 'estabelecimento', 'payee']);
    $amountIndex = $find(['valor', 'amount', 'valor_lancamento']);
    $debitIndex = $find(['debito', 'valor_debito']);
    $creditIndex = $find(['credito', 'valor_credito']);

    if ($dateIndex === null || ($amountIndex === null && $debitIndex === null && $creditIndex === null)) {
        throw new RuntimeException('CSV sem as colunas necessárias. Use Data + Valor (ou Débito/Crédito).');
    }

    $transactions = [];
    foreach ($lines as $rowNumber => $line) {
        if (trim($line) === '') {
            continue;
        }
        $row = str_getcsv($line, $delimiter);
        $date = csv_parse_date((string) ($row[$dateIndex] ?? ''));
        if ($date === null) {
            continue;
        }
        if ($amountIndex !== null) {
            $amount = csv_parse_amount((string) ($row[$amountIndex] ?? ''));
        } else {
            $credit = $creditIndex !== null ? abs(csv_parse_amount((string) ($row[$creditIndex] ?? ''))) : 0.0;
            $debit = $debitIndex !== null ? abs(csv_parse_amount((string) ($row[$debitIndex] ?? ''))) : 0.0;
            $amount = $credit > 0 ? $credit : -$debit;
        }
        if (abs($amount) < 0.001) {
            continue;
        }
        $description = trim((string) ($descriptionIndex !== null ? ($row[$descriptionIndex] ?? '') : ''));
        $payee = trim((string) ($payeeIndex !== null ? ($row[$payeeIndex] ?? '') : ''));
        $fingerprint = hash('sha256', $date . '|' . number_format($amount, 2, '.', '') . '|' . $description . '|' . $payee . '|' . $rowNumber);
        $transactions[] = [
            'fitId' => 'csv-' . substr($fingerprint, 0, 32),
            'date' => $date,
            'amount' => round($amount, 2),
            'type' => $amount < 0 ? 'EXPENSE' : 'INCOME',
            'description' => $description !== '' ? $description : ($payee !== '' ? $payee : 'Lançamento importado'),
            'payee' => $payee !== '' ? $payee : null,
            'memo' => null,
        ];
    }
    return $transactions;
}

function csv_normalize_header(string $header): string
{
    $header = trim($header);
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $header);
    $header = strtolower($ascii !== false ? $ascii : $header);
    return trim(preg_replace('/[^a-z0-9]+/', '_', $header) ?? $header, '_');
}

function csv_parse_date(string $raw): ?string
{
    $raw = trim($raw);
    foreach (['!d/m/Y', '!d-m-Y', '!Y-m-d', '!d/m/y'] as $format) {
        $date = DateTime::createFromFormat($format, $raw);
        if ($date && $date->format(str_replace('!', '', $format)) === $raw) {
            return $date->format('Y-m-d');
        }
    }
    return null;
}

function csv_parse_amount(string $raw): float
{
    $value = preg_replace('/[^\d,\.\-+]/', '', trim($raw)) ?? '';
    if (str_contains($value, ',') && str_contains($value, '.')) {
        if (strrpos($value, ',') > strrpos($value, '.')) {
            $value = str_replace('.', '', $value);
            $value = str_replace(',', '.', $value);
        } else {
            $value = str_replace(',', '', $value);
        }
    } elseif (str_contains($value, ',')) {
        $value = str_replace('.', '', $value);
        $value = str_replace(',', '.', $value);
    }
    return (float) $value;
}
