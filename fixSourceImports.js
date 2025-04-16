#!/usr/bin/env node

/**
 * This script removes .ts extensions from imports in TypeScript source files
 * to make them compatible with the TypeScript compiler.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the TypeScript source files
const srcDir = path.join(__dirname, 'src');

// Extensions to process
const extensions = ['.ts'];

/**
 * Recursively get all TypeScript files in a directory
 */
async function getTsFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const subFiles = await getTsFiles(fullPath);
      files.push(...subFiles);
    } else if (extensions.includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Fix imports in a file
 */
async function fixImportsInFile(file) {
  try {
    let content = await fs.readFile(file, 'utf8');
    let modified = false;

    // Remove .ts extensions from imports
    const importRegex = /from\s+['"](.+?)\.ts['"];/g;
    content = content.replace(importRegex, (match, importPath) => {
      modified = true;
      return `from '${importPath}';`;
    });

    // Remove .ts extensions from dynamic imports
    const dynamicImportRegex = /import\(['"](.+?)\.ts['"]\)/g;
    content = content.replace(dynamicImportRegex, (match, importPath) => {
      modified = true;
      return `import('${importPath}')`;
    });

    if (modified) {
      await fs.writeFile(file, content, 'utf8');
      console.log(`Fixed imports in ${path.relative(__dirname, file)}`);
    }
  } catch (error) {
    console.error(`Error fixing imports in ${file}:`, error);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Fixing imports in TypeScript files...');
  try {
    const files = await getTsFiles(srcDir);
    console.log(`Found ${files.length} TypeScript files`);

    await Promise.all(files.map(fixImportsInFile));
    console.log('Import fixing complete!');
  } catch (error) {
    console.error('Error fixing imports:', error);
    process.exit(1);
  }
}

main();
