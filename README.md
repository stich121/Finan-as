# Finanças

App de finanças pessoais: contas, categorias, transações (incl. transferências), importação de
extratos OFX com categorização automática por regras, orçamento mensal e transações recorrentes.

Stack: **HTML/CSS/JavaScript puro** (MPA — cada tela é uma página `.php` real, navegação por link
normal, sem framework/build step) no front-end e **PHP + MySQL** no back-end. Funciona como **PWA**
(pode ser instalado no celular como app, com ícone, tela cheia e cache offline dos assets estáticos).

## Estrutura

```
public/           <- document root do site (é isso que vai pro subdomínio)
  index.php, login.php, register.php, accounts.php, categories.php,
  transactions.php, transactions-import.php, rules.php, budgets.php,
  recurring.php, settings.php    <- uma página por rota (MPA)
  partials/          header.php (layout + guarda de sessão) e footer.php (fecha o layout)
  manifest.webmanifest, sw.js
  assets/css, assets/js            módulos JS por página, montados dentro de cada .php
  icons/
  api/               backend PHP (front controller em api/index.php)
    config.php         credenciais do banco (NÃO versionado, copie de config.example.php)
    routes/, lib/
sql/
  schema.sql         schema completo do MySQL
```

## Rodando localmente

Pré-requisitos: PHP 8.1+ com extensões `pdo_mysql`, `mbstring`, `simplexml` (padrão em qualquer
instalação PHP) e um MySQL/MariaDB local (ou XAMPP/Laragon/etc).

1. Crie um banco local e rode `sql/schema.sql` nele (via linha de comando, phpMyAdmin, TablePlus, etc).
2. Copie `public/api/config.example.php` para `public/api/config.php` e preencha com os dados do
   banco local (`env` pode ficar como `development` para ver detalhes de erro nas respostas).
3. Suba o servidor embutido do PHP a partir da raiz do projeto:

   ```
   php -S localhost:8080 -t public
   ```

4. Acesse `http://localhost:8080`. Crie uma conta pelo formulário de registro — categorias e regras
   padrão são criadas automaticamente.

Não há build step: qualquer alteração em `public/` é refletida direto no navegador (dê F5).

## Deploy na Hostinger

1. **Banco de dados**: no hPanel, crie um banco MySQL e um usuário com acesso a ele (em
   *Bancos de dados MySQL*). Anote host, nome do banco, usuário e senha.
2. **Importar o schema**: abra o phpMyAdmin do hPanel para esse banco e importe `sql/schema.sql`.
3. **Subdomínio**: em *Domínios → Subdomínios*, crie `financas` (para `financas.devstich.com.br`)
   e aponte o "document root" dele para a pasta onde você vai subir o conteúdo de `public/` (ex.:
   `financas.devstich.com.br` → suba o conteúdo de `public/` diretamente nessa pasta, incluindo o
   `api/` e o `.htaccess`).
4. **Upload**: envie todo o conteúdo de `public/` (arquivos e pastas, incluindo os ocultos como
   `.htaccess`) para a pasta do subdomínio via Gerenciador de Arquivos do hPanel ou FTP.
5. **Configuração**: copie `api/config.example.php` para `api/config.php` dentro da pasta enviada
   (direto pelo Gerenciador de Arquivos ou FTP) e preencha com os dados do banco criado no passo 1.
   Defina `env` como `production`.
6. Acesse `https://financas.devstich.com.br` e crie sua conta.

Não há passo de build/compilação — é só subir os arquivos. PHP nunca é servido como texto puro
(sempre executado pelo servidor), então ter `config.php` dentro da pasta pública é seguro; o
`.htaccess` incluído ainda bloqueia explicitamente o acesso direto a ele por HTTP.

## Instalar como app no celular (PWA)

Depois de publicado em HTTPS (a Hostinger já fornece certificado SSL grátis para subdomínios):

- **Android/Chrome**: abra o site, toque no menu (⋮) → "Adicionar à tela inicial" / "Instalar app".
- **iPhone/Safari**: abra o site, toque em Compartilhar → "Adicionar à Tela de Início".

O app abre em tela cheia (sem barra de endereço), com ícone próprio, e mantém o shell em cache
para abrir rapidamente mesmo com conexão instável (as chamadas de API exigem rede).
