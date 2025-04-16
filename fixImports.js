#!/usr/bin/env node

/**
 * This script adds .js extensions to imports in compiled JavaScript files.
 * Run this after TypeScript compilation to fix imports for ES modules.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the compiled JavaScript files
const distDir = path.join(__dirname, 'dist');

// Extensions to process
const extensions = ['.js', '.mjs'];

// File extensions to add to imports
const extensionsToFix = ['.js', '.ts'];

/**
 * Recursively get all JavaScript files in a directory
 */
async function getJsFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const subFiles = await getJsFiles(fullPath);
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

    // Fix import statements
    const importRegex = /from\s+['"](\..*?)(?:\.js|\.ts)?['"];/g;
    content = content.replace(importRegex, (match, importPath) => {
      modified = true;
      return `from '${importPath}.js';`;
    });

    // Fix dynamic imports
    const dynamicImportRegex = /import\(['"](\..*?)(?:\.js|\.ts)?['"]\)/g;
    content = content.replace(dynamicImportRegex, (match, importPath) => {
      modified = true;
      return `import('${importPath}.js')`;
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
  console.log('Fixing imports in JavaScript files...');
  try {
    const files = await getJsFiles(distDir);
    console.log(`Found ${files.length} JavaScript files`);

    await Promise.all(files.map(fixImportsInFile));
    console.log('Import fixing complete!');
  } catch (error) {
    console.error('Error fixing imports:', error);
    process.exit(1);
  }
}

main();
