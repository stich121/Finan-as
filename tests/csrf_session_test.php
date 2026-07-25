<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/lib/auth.php';

$_SESSION = ['user_id' => 'legacy-session-user'];
$token = current_csrf_token();

assert(is_string($token));
assert(strlen($token) === 64);
assert(ctype_xdigit($token));
assert(current_csrf_token() === $token);

echo "CSRF legacy session test: OK\n";
