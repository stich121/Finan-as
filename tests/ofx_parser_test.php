<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/lib/ofx_parser.php';

$ofx = <<<'OFX'
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260724</DTPOSTED>
<TRNAMT>-12.34</TRNAMT>
<FITID>ampersand-test-1</FITID>
<NAME>Loja A & Loja B</NAME>
<MEMO>Compra &amp; entrega</MEMO>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
OFX;

$transactions = parse_ofx_file($ofx);

assert(count($transactions) === 1);
assert($transactions[0]['fitId'] === 'ampersand-test-1');
assert($transactions[0]['date'] === '2026-07-24');
assert($transactions[0]['amount'] === -12.34);
assert($transactions[0]['type'] === 'EXPENSE');
assert($transactions[0]['description'] === 'Loja A & Loja B');
assert($transactions[0]['memo'] === 'Compra & entrega');

echo "OFX parser test: OK\n";
