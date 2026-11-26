import fs from 'node:fs';
import path from 'node:path';

const DOMAIN = 'https://aethexflow.online';
const ROUTES = [
  '/',
  '/chat',
  '/dag',
  '/video-studio',
  '/tools',
  '/bots',
  '/aethi-hub',
  '/settings',
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROUTES.map(
  (r) => `  <url>
    <loc>${DOMAIN}${r === '/' ? '' : r}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${r === '/' ? '1.0' : '0.8'}</priority>
  </url>`
).join('\n')}
</urlset>`;

const distDir = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemap, 'utf8');
console.log('Successfully generated dist/sitemap.xml via root sitemap-gen.js');
