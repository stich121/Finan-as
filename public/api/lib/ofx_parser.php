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
