#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const deployDir = path.join(rootDir, "deploy");
const serverPkg = JSON.parse(readFileSync(path.join(rootDir, "server", "package.json"), "utf-8"));

// Pacotes de terceiros mantidos fora do bundle (precisam existir em node_modules no servidor).
// Deve espelhar as flags --external do script "build:bundle" em server/package.json.
const EXTERNAL_DEPS = [
  "express",
  "@prisma/client",
  "jsonwebtoken",
  "bcryptjs",
  "cors",
  "cookie-parser",
  "multer",
  "fast-xml-parser",
  "dotenv",
];

function run(command, cwd) {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: "inherit", cwd: cwd ?? rootDir });
}

// Rodamos como "postinstall" do pacote raiz — inclusive em produção (Hostinger costuma
// setar NODE_ENV=production também na fase de instalação, o que faz o npm pular
// devDependencies). Sem vite/esbuild/prisma CLI instalados o build abaixo quebraria,
// então garantimos aqui que as devDependencies de todos os workspaces existem antes de
// buildar. --ignore-scripts evita reentrar neste mesmo postinstall (recursão infinita).
console.log("== 0/6 Garantindo devDependencies (vite, esbuild, prisma) ==");
run("npm install --include=dev --ignore-scripts --no-audit --no-fund");

console.log("== 1/6 Limpando pasta deploy/ ==");
rmSync(deployDir, { recursive: true, force: true });
mkdirSync(deployDir, { recursive: true });

console.log("== 2/6 Gerando Prisma Client ==");
run("npm run prisma:generate --workspace=server");

console.log("== 3/6 Build do client (Vite) ==");
run("npm run build --workspace=client");

console.log("== 4/6 Bundle do servidor (esbuild) ==");
run("npm run build:bundle --workspace=server");

console.log("== 5/6 Copiando client/dist -> deploy/public e prisma/ ==");
cpSync(path.join(rootDir, "client", "dist"), path.join(deployDir, "public"), { recursive: true });
cpSync(path.join(rootDir, "server", "prisma"), path.join(deployDir, "prisma"), { recursive: true });

console.log("== 6/6 Gerando package.json e .env.example do deploy ==");
const deployDependencies = {};
for (const dep of EXTERNAL_DEPS) {
  if (!serverPkg.dependencies[dep]) {
    throw new Error(`Dependência externa "${dep}" não encontrada em server/package.json`);
  }
  deployDependencies[dep] = serverPkg.dependencies[dep];
}
// "prisma" (CLI) precisa estar em dependencies (não devDependencies) para o postinstall rodar
// mesmo que a Hostinger instale só produção.
deployDependencies.prisma = serverPkg.devDependencies.prisma;

const deployPkg = {
  name: "financas-app-deploy",
  version: "1.0.0",
  private: true,
  scripts: {
    postinstall: "prisma generate",
    start: "node server.mjs",
  },
  dependencies: deployDependencies,
};
writeFileSync(path.join(deployDir, "package.json"), JSON.stringify(deployPkg, null, 2) + "\n");

const envExample = `# Copie estas variáveis para a seção "Environment variables" do app Node.js no hPanel
# (não suba um .env real por FTP dentro desta pasta).

# O banco MySQL da Hostinger fica num servidor separado do app Node (mesmo estando na mesma
# conta) — "localhost" NÃO funciona aqui, precisa do host remoto mesmo em produção.
DATABASE_URL="mysql://u654041352_MathFinancas:SENHA_AQUI@srv1894.hstgr.io:3306/u654041352_Financas"

# Gere segredos novos (nao reaproveitar os de desenvolvimento), ex: openssl rand -hex 32
JWT_ACCESS_SECRET="GERAR_SEGREDO_NOVO_AQUI"
JWT_REFRESH_SECRET="GERAR_OUTRO_SEGREDO_NOVO_AQUI"
ACCESS_TOKEN_TTL="15m"
REFRESH_TOKEN_TTL="30d"

CLIENT_ORIGIN="https://financas.devstich.com.br"
NODE_ENV="production"
# PORT normalmente é definida automaticamente pela Hostinger para o app Node.
`;
writeFileSync(path.join(deployDir, ".env.example"), envExample);

console.log(`\nPronto! Pasta "deploy/" gerada em: ${deployDir}`);
console.log("Conteúdo: server.mjs, public/, prisma/, package.json, .env.example");
