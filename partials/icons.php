<?php
declare(strict_types=1);

// Espelha assets/js/icons.js (mesmo conjunto de ícones), para uso em partes renderizadas no servidor.

function icon_paths(): array
{
    return [
        'wallet' => '<path d="M3 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M16 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor" stroke="none"/>',
        'home' => '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/>',
        'card' => '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 14.5h4"/>',
        'bank' => '<path d="M3 21h18"/><path d="M4 21V10"/><path d="M20 21V10"/><path d="M2 10l10-6 10 6"/><path d="M8 21v-6"/><path d="M12 21v-6"/><path d="M16 21v-6"/>',
        'target' => '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
        'settings' => '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.65 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.65a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.65a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.35 9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
    ];
}

function icon_svg(string $name, int $size = 20, string $class = ''): string
{
    $paths = icon_paths();
    $path = $paths[$name] ?? '';
    $cls = $class !== '' ? ' class="' . htmlspecialchars($class, ENT_QUOTES, 'UTF-8') . '"' : '';
    return "<svg{$cls} width=\"{$size}\" height=\"{$size}\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">{$path}</svg>";
}
