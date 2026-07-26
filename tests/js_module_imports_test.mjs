import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsRoot = path.join(root, 'assets', 'js');

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(absolute) : entry.name.endsWith('.js') ? [absolute] : [];
  });
}

function exportedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const item of match[1].split(',')) {
      const parts = item.trim().split(/\s+as\s+/);
      if (parts[1] || parts[0]) names.add((parts[1] || parts[0]).trim());
    }
  }
  return names;
}

const errors = [];
for (const file of filesIn(jsRoot)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const specifier = match[2];
    if (!specifier.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), specifier.split('?')[0]);
    if (!fs.existsSync(target)) {
      errors.push(`${path.relative(root, file)} importa arquivo inexistente: ${specifier}`);
      continue;
    }
    const exports = exportedNames(fs.readFileSync(target, 'utf8'));
    for (const imported of match[1].split(',')) {
      const name = imported.trim().split(/\s+as\s+/)[0].trim();
      if (name && !exports.has(name)) {
        errors.push(`${path.relative(root, file)} importa "${name}", ausente em ${path.relative(root, target)}`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('JS module imports test: OK');
