/**
 * Replace literal '?.?' with 'ج.م' (Egyptian Pound) and ' � ' separator
 * with ' · '. Safe: '?.?' is not valid in JS/TS outside a corrupted string.
 */
const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const c = fs.readFileSync(f, 'utf8');
  let n1 = 0, n2 = 0;
  const out = c
    .replace(/\?\.\?/g, () => { n1++; return 'ج.م'; })
    .replace(/ \uFFFD /g, () => { n2++; return ' · '; });
  if (n1 || n2) {
    fs.writeFileSync(f, out);
    console.log(`[${f}] ?.?→ج.م: ${n1}   ' � '→' · ': ${n2}`);
  }
}
