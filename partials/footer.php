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
  <script type="module">
    import { render } from '<?= h($entryScript . '?v=' . $assetVersion) ?>';
    import { setState } from '/assets/js/state.js?v=<?= h($assetVersion) ?>';
    if (window.__APP_STATE__) setState(window.__APP_STATE__);
    render(document.getElementById('view'), <?= json_encode($entryScriptArgs ?? [], JSON_UNESCAPED_UNICODE) ?>);
  </script>
  <?php endif; ?>
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js?v=<?= h($assetVersion) ?>', { updateViaCache: 'none' })
          .then((registration) => registration.update())
          .catch(() => {});
      });
    }
  </script>
</body>
</html>
