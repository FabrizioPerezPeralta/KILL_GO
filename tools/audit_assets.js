'use strict';
/* =====================================================================
   DUST STRIKE — tools/audit_assets.js
   Auditoría de integridad de enlaces, scripts y assets multimedia
   ===================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('🔍 DUST STRIKE — Iniciando auditoría de assets y enlaces...\n');

let errors = 0;
let warnings = 0;
let checkedCount = 0;

function checkFileExists(relPath, sourceFile) {
  // Ignorar enlaces externos o URIs data
  if (/^(https?:|\/\/|data:|mailto:)/i.test(relPath)) {
    return true;
  }

  // Quitar parámetros de consulta o anclas
  const cleanPath = relPath.split('?')[0].split('#')[0];
  const fullPath = path.resolve(ROOT_DIR, cleanPath);
  checkedCount++;

  if (!fs.existsSync(fullPath)) {
    console.error(`  ❌ [404 NO ENCONTRADO] "${cleanPath}" referenciado en "${sourceFile}"`);
    errors++;
    return false;
  }

  const stat = fs.statSync(fullPath);
  const sizeKb = (stat.size / 1024).toFixed(1);

  // Alertas de tamaño de asset
  if (stat.size > 1.5 * 1024 * 1024) {
    console.warn(`  ⚠️  [PESO ELEVADO] "${cleanPath}" supera 1.5 MB (${sizeKb} KB)`);
    warnings++;
  } else {
    console.log(`  ✓ OK: "${cleanPath}" (${sizeKb} KB)`);
  }
  return true;
}

// 1. Auditar index.html
const htmlPath = path.resolve(ROOT_DIR, 'index.html');
if (fs.existsSync(htmlPath)) {
  console.log(`📄 Analizando "${path.relative(ROOT_DIR, htmlPath)}"...`);
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Scripts
  const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["']/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    checkFileExists(match[1], 'index.html');
  }

  // Links (CSS, favicon)
  const linkRegex = /<link\s+[^>]*href=["']([^"']+)["']/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    checkFileExists(match[1], 'index.html');
  }

  // Meta og:image
  const ogRegex = /<meta\s+[^>]*content=["']([^"']+\.(?:png|jpg|jpeg|webp|svg))["']/gi;
  while ((match = ogRegex.exec(html)) !== null) {
    checkFileExists(match[1], 'index.html');
  }

  // Img tags
  const imgRegex = /<img\s+[^>]*src=["']([^"']+)["']/gi;
  while ((match = imgRegex.exec(html)) !== null) {
    checkFileExists(match[1], 'index.html');
  }
} else {
  console.error('❌ Error: No se encontró index.html');
  errors++;
}

// 2. Auditar style.css
const cssPath = path.resolve(ROOT_DIR, 'style.css');
if (fs.existsSync(cssPath)) {
  console.log(`\n🎨 Analizando "${path.relative(ROOT_DIR, cssPath)}"...`);
  const css = fs.readFileSync(cssPath, 'utf8');
  const urlRegex = /url\(["']?([^"')]+)["']?\)/gi;
  let match;
  while ((match = urlRegex.exec(css)) !== null) {
    checkFileExists(match[1], 'style.css');
  }
}

// 3. Resumen final
console.log('\n----------------------------------------');
console.log(`📊 Total de assets verificados: ${checkedCount}`);
console.log(`⚠️  Advertencias: ${warnings}`);
console.log(`❌ Errores: ${errors}`);
console.log('----------------------------------------\n');

if (errors > 0) {
  console.error('💥 La auditoría falló: hay recursos rotos o no encontrados.');
  process.exit(1);
} else {
  console.log('🎉 Auditoría exitosa: todos los assets están íntegros.');
}

