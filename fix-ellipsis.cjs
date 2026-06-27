/**
 * Safe heuristic: U+FFFD at the end of a string literal is almost always the
 * '…' (horizontal ellipsis) that got mangled. Replace those occurrences only.
 *
 * Usage:  node fix-ellipsis.cjs <file1> <file2> ...
 */
const fs = require('fs');
const PAT = /\uFFFD(?=["'`<])/g;

for (const f of process.argv.slice(2)) {
  const c = fs.readFileSync(f, 'utf8');
  let n = 0;
  const out = c.replace(PAT, () => { n++; return '…'; });
  if (n) {
    fs.writeFileSync(f, out);
    console.log(`[${f}] replaced ${n} '\\uFFFD' -> '…'`);
  } else {
    console.log(`[${f}] no end-of-string FFFD found`);
  }
}
