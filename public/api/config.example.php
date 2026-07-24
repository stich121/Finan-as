<?php
// Copie este arquivo para "config.php" (mesma pasta) e preencha com os dados
// do banco criado no hPanel da Hostinger. NÃO versionar config.php (está no .gitignore).

return [
    'db_host' => 'localhost',
    'db_name' => 'u000000000_financas',
    'db_user' => 'u000000000_financas',
    'db_pass' => 'troque-esta-senha',

    // Ambiente: 'production' esconde detalhes de erro nas respostas da API.
    'env' => 'production',

    // Usado para derivar cookies de sessão seguros. Gere uma string aleatória longa.
    'app_secret' => 'troque-por-uma-string-aleatoria-longa',
];
