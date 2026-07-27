# Finanças

App de finanças pessoais: contas, cartões e faturas, compras parceladas, categorias, transações
(incl. transferências), importação de extratos OFX com categorização automática por regras,
orçamento mensal, metas, recorrências, previsão de fluxo de caixa e relatórios exportáveis.

Stack: **HTML/CSS/JavaScript puro** (MPA — cada tela é uma página `.php` real, navegação por link
normal, sem framework/build step) no front-end e **PHP + MySQL** no back-end. Funciona como **PWA**
(pode ser instalado no celular como app, com ícone, tela cheia e cache offline dos assets estáticos).

A raiz deste repositório **é** o document root do site (não há pasta `public/` — o conteúdo já fica
direto na raiz de propósito, para deploys que publicam a raiz do repositório tal como está, ex.:
document root = `public_html`).

## Estrutura

```
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
  schema.sql         schema completo do MySQL (não precisa ficar acessível pela web)
```

## Rodando localmente

Pré-requisitos: PHP 8.1+ com extensões `pdo_mysql`, `mbstring`, `simplexml` (padrão em qualquer
instalação PHP) e um MySQL/MariaDB local (ou XAMPP/Laragon/etc).

1. Crie um banco local e rode `sql/schema.sql` nele (via linha de comando, phpMyAdmin, TablePlus, etc).
2. Copie `api/config.example.php` para `api/config.php` e preencha com os dados do banco local
   (`env` pode ficar como `development` para ver detalhes de erro nas respostas).
3. Suba o servidor embutido do PHP a partir da raiz do projeto:

   ```
   php -S localhost:8080
   ```

4. Acesse `http://localhost:8080`. Crie uma conta pelo formulário de registro — categorias e regras
   padrão são criadas automaticamente.

### Atualizando um banco que já existe

Se o banco já possui as tabelas da versão anterior, não importe o schema completo novamente.
No phpMyAdmin, selecione o banco e execute apenas:

```
sql/migration_2026_07_finance_complete.sql
```

Essa migração preserva usuários, contas e transações existentes e adiciona os campos de limite,
fechamento, vencimento, faturas, parcelas e situação de conciliação.

Para instalar o centro de planejamento, análises e compartilhamento em uma instalação antiga,
execute também:

```
sql/migration_2026_07_productivity_suite.sql
```

O aplicativo também tenta criar essas estruturas automaticamente no primeiro acesso à página
Planejamento, desde que o usuário MySQL possua permissão para criar e alterar tabelas.

## Recursos principais

- Contas correntes, poupança, dinheiro, investimentos e cartões de crédito
- Faturas abertas, fechadas, pagas e atrasadas, com pagamentos parciais ou totais
- Compras parceladas distribuídas automaticamente nas próximas faturas
- Limite utilizado e disponível por cartão
- Transações pendentes ou confirmadas, transferências e tags
- OFX/QFX/CSV com pré-visualização, regras automáticas e proteção contra duplicados
- Orçamento mensal, recorrências e metas financeiras
- Dashboard com patrimônio líquido, dívidas, alertas e previsão de seis meses
- Relatórios por período, categorias e beneficiários, com exportação CSV e backup JSON
- Calendário financeiro, conciliação de saldos e fechamento mensal
- Detector de assinaturas, planejamento de dívidas e projeções para 30, 60 e 90 dias
- Divisão de compras por categoria, despesas com pessoas e carteiras compartilhadas
- Evolução patrimonial, mapa de calor, gastos essenciais e relatório anual
- Comprovantes com OCR no navegador, assistente financeiro e modo privacidade
- Widgets configuráveis e notificações PWA com sincronização periódica quando suportada
- Tema claro, escuro ou automático e instalação como PWA

Não há build step: qualquer alteração nos arquivos é refletida direto no navegador (dê F5).

## Deploy

1. **Banco de dados**: crie um banco MySQL e um usuário com acesso a ele. Anote host, nome do
   banco, usuário e senha.
2. **Importar o schema**: importe `sql/schema.sql` no banco criado (via phpMyAdmin, por exemplo).
3. **Document root**: aponte o domínio/subdomínio para a pasta onde o conteúdo deste repositório
   for publicado (a raiz do repo = raiz do site; não há passo de build).
4. **Configuração**: copie `api/config.example.php` para `api/config.php` no servidor e preencha
   com os dados do banco criado no passo 1. Defina `env` como `production`.
5. Acesse o site e crie sua conta.

⚠️ **Importante**: `api/config.php` nunca é versionado (está no `.gitignore`) porque contém a senha
do banco em texto puro. Se o deploy for automático (ex.: deploy via Git), configure a variável de
ambiente/arquivo de configuração diretamente no painel de hospedagem — nunca commite esse arquivo.

⚠️ **Pré-requisito do hosting**: este projeto precisa de um ambiente que **execute PHP como servidor
de aplicação** (Apache/Nginx + PHP-FPM, PHP embutido, etc.), não apenas sirva arquivos estáticos.
Deploys pensados só para sites estáticos (HTML/CSS/JS) não vão rodar os arquivos `.php` — eles vão
aparecer como 404 ou serão baixados como texto.

## Instalar como app no celular (PWA)

Depois de publicado em HTTPS:

- **Android/Chrome**: abra o site, toque no menu (⋮) → "Adicionar à tela inicial" / "Instalar app".
- **iPhone/Safari**: abra o site, toque em Compartilhar → "Adicionar à Tela de Início".

O app abre em tela cheia (sem barra de endereço), com ícone próprio, e mantém os assets estáticos
em cache para abrir rapidamente mesmo com conexão instável (as chamadas de API exigem rede).
