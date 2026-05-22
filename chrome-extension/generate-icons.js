/**
 * Generate extension icons as PNG files.
 * Run: node generate-icons.js
 */

// oxlint-disable-next-line no-unused-vars
const { createCanvas } = (() => {
  // Fallback for environments without canvas
  try {
    return require('canvas');
  } catch {
    // Generate SVG-based icons instead
    return { createCanvas: null };
  }
})();

const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const outDir = path.join(__dirname, 'icons');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Since we may not have 'canvas' available, generate SVG icons
// and convert them to data URI PNGs using an HTML file
for (const size of sizes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e1b4b"/>
      <stop offset="100%" style="stop-color:#0c0a3e"/>
    </linearGradient>
    <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <!-- Background -->
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <!-- Camera Body -->
  <g filter="url(#glow)" transform="translate(64,68)">
    <rect x="-38" y="-24" width="76" height="48" rx="8" fill="url(#fg)" opacity="0.9"/>
    <!-- Lens -->
    <circle cx="0" cy="0" r="16" fill="none" stroke="#fff" stroke-width="3" opacity="0.9"/>
    <circle cx="0" cy="0" r="8" fill="rgba(255,255,255,0.3)"/>
    <!-- Flash/viewfinder -->
    <rect x="-12" y="-32" width="24" height="10" rx="3" fill="url(#fg)"/>
  </g>
  <!-- AI Sparkle -->
  <g transform="translate(96,30)">
    <path d="M0,-10 L2,-3 L10,0 L2,3 L0,10 L-2,3 L-10,0 L-2,-3 Z" fill="#fbbf24" opacity="0.9"/>
  </g>
</svg>`;

  const outPath = path.join(outDir, `icon${size}.svg`);
  fs.writeFileSync(outPath, svg);
  console.log(`Generated ${outPath}`);
}

// Also, create a simple HTML file to convert SVGs to PNGs
const converterHtml = `<!DOCTYPE html>
<html>
<head><title>Icon Converter</title></head>
<body>
<p>Right-click each image and "Save image as..." to save as PNG:</p>
${sizes.map(s => `
<div style="margin:10px">
  <p>${s}x${s}:</p>
  <canvas id="c${s}" width="${s}" height="${s}"></canvas>
</div>
`).join('')}
<script>
${sizes.map(s => `
{
  const img = new Image();
  img.onload = () => {
    const c = document.getElementById('c${s}');
    c.getContext('2d').drawImage(img, 0, 0, ${s}, ${s});
    // Auto-download
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'icon${s}.png';
    a.click();
  };
  img.src = 'icons/icon${s}.svg';
}
`).join('')}
</script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'convert-icons.html'), converterHtml);
console.log('\\nGenerated convert-icons.html');
console.log('Open it in a browser to auto-download PNG icons.');
console.log('Or use the SVG icons directly (update manifest.json icon paths to .svg).');
