const fs = require('fs');
const path = require('path');

function scanDir(dir, ext = ['.ts', '.js']) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !full.includes('node_modules') && !full.includes('dist') && !full.includes('.git')) {
      results = results.concat(scanDir(full, ext));
    } else if (e.isFile() && ext.includes(path.extname(full))) {
      results.push(full);
    }
  }
  return results;
}

const files = scanDir(path.join(__dirname, '..', 'src'));
console.log(`Scanning ${files.length} files...`);

for (const file of files) {
  if (file.includes('.test.') || file.includes('.spec.')) {continue;}
  const content = fs.readFileSync(file, 'utf8');
  
  // Find global/module level collections
  // const myMap: Map<A, B> = new Map()
  const mapRegex = /const\s+(\w+)\s*:\s*Map<.*?>\s*=\s*new\s*Map\(\)/g;
  // const mySet: Set<A> = new Set()
  const setRegex = /const\s+(\w+)\s*:\s*Set<.*?>\s*=\s*new\s*Set\(\)/g;
  // const myArray: string[] = []
  const arrayRegex = /const\s+(\w+)\s*:\s*.*?\[\]\s*=\s*\[\]/g;
  const simpleArrayRegex = /const\s+(\w+)\s*=\s*\[\]/g;
  // const myRecord: Record<A, B> = {}
  const recordRegex = /const\s+(\w+)\s*:\s*Record<.*?>\s*=\s*\{\}/g;

  let match;
  const collections = [];
  
  [mapRegex, setRegex, arrayRegex, simpleArrayRegex, recordRegex].forEach(r => {
    while ((match = r.exec(content)) !== null) {
      if (!content.substring(Math.max(0, match.index - 50), match.index).includes('export')) {
        collections.push({ name: match[1], index: match.index });
      }
    }
  });

  for (const c of collections) {
    // Check if it exists inside a function (heuristic: count braces before it)
    const before = content.substring(0, c.index);
    const openBraces = (before.match(/\{/g) || []).length;
    const closeBraces = (before.match(/\}/g) || []).length;
    
    // Only care if it's module level (openBraces == closeBraces heuristics)
    if (openBraces !== closeBraces) {continue;}

    const name = c.name;
    const hasAdd = content.includes(`${name}.set(`) || content.includes(`${name}.push(`) || content.includes(`${name}.add(`);
    
    if (hasAdd) {
      const hasClear = content.includes(`${name}.clear()`) || content.includes(`${name}.delete(`) || content.includes(`${name}.pop()`) || content.includes(`${name}.shift()`) || content.includes(`${name}.splice(`) || content.includes(`${name}.length = 0`) || content.includes(`Delete`) || content.includes(`remove`);
      if (!hasClear) {
        console.log(`[Leak Warning] ${path.relative(process.cwd(), file)}: Unbounded module-level collection '${name}' is added to but appears never cleared.`);
      }
    }
  }
}
