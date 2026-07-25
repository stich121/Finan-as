<?php
// Copie este arquivo para "config.php" (mesma pasta) e preencha com os dados
// do banco criado no hPanel da Hostinger. NÃO versionar config.php (está no .gitignore).

return [
    // Use 127.0.0.1 para forçar TCP e evitar erro de socket Unix na Hostinger.
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => 'u000000000_financas',
    'db_user' => 'u000000000_financas',
    'db_pass' => 'troque-esta-senha',

    // Ambiente: 'production' esconde detalhes de erro nas respostas da API.
    'env' => 'production',

    // Usado para derivar cookies de sessão seguros. Gere uma string aleatória longa.
    'app_secret' => 'troque-por-uma-string-aleatoria-longa',
];
