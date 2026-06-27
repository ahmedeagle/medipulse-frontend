/**
 * Recovers Arabic UTF-8 strings that were corrupted to literal '?' characters.
 * Strategy: use git HEAD as the Arabic dictionary. For each working-copy line
 * that contains a run of 2+ '?', build a "skeleton" (Arabic and '?{2,}' both
 * normalized to <X>) and look up the matching line in HEAD. If the skeleton is
 * unique in HEAD, swap each '?{2,}' for the corresponding Arabic word.
 *
 * Single '?' chars are NEVER touched — those are real ternary / optional-chain
 * syntax.
 *
 * Run:  node restore-arabic.js <file1> <file2> ...
 */
const fs = require('fs');
const { execSync } = require('child_process');

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g;
const QQ = /\?{2,}/g;

function skeletonHead(line) {
  return line.replace(ARABIC, '<X>');
}
function skeletonWork(line) {
  return line.replace(ARABIC, '<X>').replace(QQ, '<X>');
}
function extractArabic(line) {
  return line.match(ARABIC) || [];
}

function restoreFile(file) {
  const head = execSync(`git show HEAD:${file}`, { encoding: 'utf8' });
  const work = fs.readFileSync(file, 'utf8');

  const headLines = head.split(/\r?\n/);
  const workLines = work.split(/\r?\n/);

  // Build skeleton -> list of HEAD candidates
  const headMap = new Map();
  for (const hl of headLines) {
    if (!ARABIC.test(hl)) continue; ARABIC.lastIndex = 0;
    const sk = skeletonHead(hl);
    if (!headMap.has(sk)) headMap.set(sk, []);
    headMap.get(sk).push({ line: hl, arabic: extractArabic(hl) });
  }

  let restored = 0, ambiguous = 0, unmatched = 0;
  const unmatchedSamples = [];

  const out = workLines.map((wl, idx) => {
    if (!QQ.test(wl)) { QQ.lastIndex = 0; return wl; }
    QQ.lastIndex = 0;
    const sk = skeletonWork(wl);
    const candidates = headMap.get(sk);
    if (!candidates || candidates.length === 0) {
      unmatched++;
      if (unmatchedSamples.length < 6) unmatchedSamples.push(`L${idx + 1}: ${wl.trim().slice(0, 100)}`);
      return wl;
    }
    let chosen = candidates[0];
    if (candidates.length > 1) ambiguous++;
    const arabic = chosen.arabic;
    let i = 0;
    const fixed = wl.replace(QQ, () => arabic[i++] ?? '???');
    restored++;
    return fixed;
  });

  fs.writeFileSync(file, out.join('\n'));
  console.log(`[${file}] restored=${restored} ambiguous=${ambiguous} unmatched=${unmatched}`);
  if (unmatchedSamples.length) {
    console.log('  unmatched samples:');
    for (const s of unmatchedSamples) console.log('    ' + s);
  }
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node restore-arabic.js <file1> <file2> ...');
  process.exit(1);
}
for (const f of files) {
  try { restoreFile(f); }
  catch (e) { console.error(`[${f}] FAILED: ${e.message}`); }
}
