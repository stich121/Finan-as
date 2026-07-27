<?php
declare(strict_types=1);
/**
 * @var string|null $entryScript Caminho do módulo JS que renderiza o conteúdo da página em #view.
 * @var array|null  $entryScriptArgs Argumentos extra (array assoc) passados para render(container, args).
 */
?>
      </main>
    <?php if ($currentUser): ?>
    </div><!-- .app-content -->
    <?php endif; ?>
  </div><!-- #app -->
  <div id="toast-root"></div>
  <?php if (!empty($entryScript)): ?>
  <script>
    window.__FINANCAS_ASSETS_READY__ = (async () => {
      const repairKey = 'financas-assets-ready-<?= h($assetVersion) ?>';
      if (sessionStorage.getItem(repairKey)) return;
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith('financas-')).map((key) => caches.delete(key)));
        }
      } finally {
        sessionStorage.setItem(repairKey, '1');
      }
    })();
  </script>
  <script type="module">
    await window.__FINANCAS_ASSETS_READY__;
    const { render } = await import('<?= h($entryScript . '?v=' . $assetVersion) ?>');
    render(document.getElementById('view'), <?= json_encode($entryScriptArgs ?? [], JSON_UNESCAPED_UNICODE) ?>);
  </script>
  <?php endif; ?>
  <script type="module">
    const { initMotion } = await import('/assets/js/motion.js?v=<?= h($assetVersion) ?>');
    initMotion();
  </script>
  <script>
    if ('serviceWorker' in navigator) {
      const swReloadKey = 'financas-sw-reloaded-<?= h($assetVersion) ?>';
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (sessionStorage.getItem(swReloadKey)) return;
        sessionStorage.setItem(swReloadKey, '1');
        window.location.reload();
      });
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js?v=<?= h($assetVersion) ?>', { updateViaCache: 'none' })
          .then((registration) => registration.update())
          .catch(() => {});
      });
    }
  </script>
</body>
</html>
