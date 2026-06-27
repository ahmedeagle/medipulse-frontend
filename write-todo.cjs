/**
 * Lists every line that still contains '?{3,}' or U+FFFD across the given
 * files, with line number and stripped content. Output is a markdown TODO
 * the user can grind through manually.
 */
const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
const out = ['# Arabic Recovery — Manual TODO', ''];
out.push(`Generated: ${new Date().toISOString()}`);
out.push('');
out.push('These lines still contain literal `?` runs (3+) or U+FFFD that the');
out.push('auto-restore script could not match against `git HEAD`. They are');
out.push('almost all in uncommitted new code that has no upstream reference.');
out.push('Fix by retyping the Arabic strings (or copy from a known-good design');
out.push('mock / spec). Lines starting with `?{3,}` mid-string are most likely');
out.push('UI labels; `�` at end of string is typically `…`; `�` between tokens');
out.push('is typically `•` or `–`.');
out.push('');

let total = 0;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const hits = [];
  lines.forEach((l, i) => {
    if (/\?{3,}|\uFFFD/.test(l)) hits.push({ ln: i + 1, text: l });
  });
  if (hits.length === 0) continue;
  out.push(`## ${f} (${hits.length} lines)`);
  out.push('');
  out.push('```');
  for (const h of hits) out.push(`L${h.ln}: ${h.text.trimEnd()}`);
  out.push('```');
  out.push('');
  total += hits.length;
}
out.unshift(`Total residual lines: **${total}**`, '');
fs.writeFileSync('ARABIC_RECOVERY_TODO.md', out.join('\n'));
console.log(`Wrote ARABIC_RECOVERY_TODO.md with ${total} residual lines`);
