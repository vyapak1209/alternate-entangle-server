import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fixImportExtensions(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    if (fs.lstatSync(fullPath).isDirectory()) {
      fixImportExtensions(fullPath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      content = content.replace(/(from\s+['"]\.\/.*)(['"])/g, '$1.js$2');
      fs.writeFileSync(fullPath, content, 'utf-8');
    }
  }
}

fixImportExtensions(path.join(__dirname, 'dist'));
console.log('Fixed import extensions in dist directory');