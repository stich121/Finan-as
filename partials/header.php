<?php

declare(strict_types=1);

/**
 * Layout compartilhado (MPA): cada página define $pageTitle, $activeNav e opcionalmente
 * $requireAuth (default true) antes de dar require neste arquivo. Faz a guarda de sessão
 * no servidor (redireciona para login/dashboard conforme o caso) e imprime a navegação.
 */

require_once __DIR__ . '/../api/lib/config.php';
require_once __DIR__ . '/../api/lib/db.php';
require_once __DIR__ . '/../api/lib/auth.php';
require_once __DIR__ . '/icons.php';

start_app_session();

$requireAuth = $requireAuth ?? true;

$currentUser = null;
if (current_user_id()) {
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([current_user_id()]);
    $currentUser = $stmt->fetch() ?: null;
    if (!$currentUser) {
        logout_user();
    }
}

if ($requireAuth && !$currentUser) {
    header('Location: /login.php');
    exit;
}
if (!$requireAuth && $currentUser) {
    header('Location: /index.php');
    exit;
}

function h($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

$navItems = [
    ['key' => 'dashboard', 'href' => '/index.php', 'icon' => 'home', 'label' => 'Início'],
    ['key' => 'transactions', 'href' => '/transactions.php', 'icon' => 'card', 'label' => 'Transações'],
    ['key' => 'accounts', 'href' => '/accounts.php', 'icon' => 'bank', 'label' => 'Contas'],
    ['key' => 'cards', 'href' => '/cards.php', 'icon' => 'card', 'label' => 'Cartões'],
    ['key' => 'settings', 'href' => '/settings.php', 'icon' => 'settings', 'label' => 'Mais'],
];
$assetVersion = '20260725.10';
$userInitial = '?';
if ($currentUser && preg_match('/^./u', trim((string) $currentUser['name']), $initialMatch)) {
    $userInitial = strtoupper($initialMatch[0]);
}
?>
<!doctype html>
<html lang="pt-BR" data-theme="<?= h($currentUser['theme'] ?? 'system') ?>">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title><?= h($pageTitle ?? 'Finanças') ?> · Finanças</title>
  <meta name="description" content="Controle financeiro pessoal: contas, categorias, orçamento e importação de extratos OFX." />
  <meta name="theme-color" content="#08101f" />
  <link rel="manifest" href="/manifest.webmanifest?v=<?= h($assetVersion) ?>" />
  <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Finanças" />
  <link rel="stylesheet" href="/assets/css/styles.css?v=<?= h($assetVersion) ?>" />
  <script>
    (() => {
      const pref = document.documentElement.dataset.theme;
      const resolved = pref === 'system'
        ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : pref;
      document.documentElement.dataset.resolvedTheme = resolved;
    })();
  </script>
  <?php if ($currentUser): ?>
  <script>
    window.__APP_STATE__ = <?= json_encode([
        'user' => [
            'id' => $currentUser['id'],
            'name' => $currentUser['name'],
            'email' => $currentUser['email'],
            'currency' => $currentUser['currency'],
            'theme' => $currentUser['theme'],
        ],
        'csrfToken' => current_csrf_token(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
  </script>
  <?php endif; ?>
</head>
<body>
  <div id="app">
    <?php if ($currentUser): ?>
    <nav class="bottom-nav">
      <a class="nav-brand" href="/index.php" aria-label="Finanças · Início">
        <span class="nav-brand-mark"><?= icon_svg('wallet', 25) ?></span>
        <span><strong>Finanças</strong><small>Seu dinheiro, claro.</small></span>
      </a>
      <div class="nav-links">
        <?php foreach ($navItems as $item): ?>
        <a href="<?= h($item['href']) ?>" class="<?= ($activeNav ?? '') === $item['key'] ? 'active' : '' ?>">
          <span class="nav-icon"><?= icon_svg($item['icon'], 22) ?></span><span><?= h($item['label']) ?></span>
        </a>
        <?php endforeach; ?>
      </div>
      <div class="nav-profile">
        <span class="user-avatar"><?= h($userInitial) ?></span>
        <span><strong><?= h($currentUser['name']) ?></strong><small><?= h($currentUser['email']) ?></small></span>
      </div>
    </nav>
    <div class="app-content">
      <header class="app-header">
        <div class="header-copy">
          <span class="header-kicker">Visão financeira</span>
          <h1><?= h($pageTitle ?? 'Finanças') ?></h1>
        </div>
        <a href="/settings.php" class="header-user" aria-label="Abrir perfil e ajustes">
          <span class="user-avatar"><?= h($userInitial) ?></span>
          <span class="header-user-copy"><small>Olá,</small><strong><?= h(explode(' ', trim($currentUser['name']))[0]) ?></strong></span>
        </a>
      </header>
      <main class="app-main" id="view">
    <?php else: ?>
      <main class="app-main" id="view" style="padding:0;">
    <?php endif; ?>
