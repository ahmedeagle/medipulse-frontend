/**
 * Recovers UTF-8 strings that were corrupted to '?' or U+FFFD.
 *
 * Strategy: use git HEAD as the source-of-truth dictionary. For each working
 * line containing a corruption marker, build a skeleton (any non-ASCII run +
 * any '?{3,}' run + any U+FFFD run all normalized to <X>) and look up the
 * matching HEAD line. If matched, substitute each corruption run with the
 * corresponding non-ASCII string from HEAD.
 *
 * Notes:
 *   - '?{2}' (the JS nullish-coalescing operator) is NEVER touched.
 *     Only runs of 3+ '?' are treated as corruption — meaning a 2-char
 *     Arabic word that became '??' is skipped (rare, accepted tradeoff).
 *   - Single U+FFFD chars ARE treated as corruption (always wrong in source).
 *
 * Usage:  node restore-arabic-v2.cjs <file1> <file2> ...
 *         Backups are expected at <file>.corrupt.bak and used as the input.
 */
const fs = require('fs');
const { execSync } = require('child_process');

const NONASCII = /[^\x00-\x7F]+/g;
const CORRUPTION = /\?{3,}|\uFFFD+/g;
const NONASCII_OR_CORRUPTION = /[^\x00-\x7F]+|\?{3,}|\uFFFD+/g;

function skeletonHead(line) { return line.replace(NONASCII, '<X>'); }
function skeletonWork(line) { return line.replace(NONASCII_OR_CORRUPTION, '<X>'); }
function extractTokens(line) { return line.match(NONASCII) || []; }

function restoreFile(file) {
  const bak = file + '.corrupt.bak';
  const source = fs.existsSync(bak) ? bak : file;
  const head = execSync(`git show HEAD:${file}`, { encoding: 'utf8' });
  const work = fs.readFileSync(source, 'utf8');

  const headLines = head.split(/\r?\n/);
  const workLines = work.split(/\r?\n/);

  // Build skeleton -> candidates from HEAD (only lines that contain non-ASCII)
  const headMap = new Map();
  for (const hl of headLines) {
    if (!/[^\x00-\x7F]/.test(hl)) continue;
    const sk = skeletonHead(hl);
    if (!headMap.has(sk)) headMap.set(sk, []);
    headMap.get(sk).push({ line: hl, tokens: extractTokens(hl) });
  }

  let restored = 0, ambiguous = 0, unmatched = 0;
  const unmatchedSamples = [];

  const out = workLines.map((wl, idx) => {
    if (!CORRUPTION.test(wl)) { CORRUPTION.lastIndex = 0; return wl; }
    CORRUPTION.lastIndex = 0;
    const sk = skeletonWork(wl);
    const candidates = headMap.get(sk);
    if (!candidates || candidates.length === 0) {
      unmatched++;
      if (unmatchedSamples.length < 8) unmatchedSamples.push(`L${idx + 1}: ${wl.trim().slice(0, 100)}`);
      return wl;
    }
    if (candidates.length > 1) ambiguous++;
    const tokens = candidates[0].tokens;
    let i = 0;
    const fixed = wl.replace(NONASCII_OR_CORRUPTION, () => tokens[i++] ?? '???');
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
if (files.length === 0) { console.error('Usage: node restore-arabic-v2.cjs <file1> <file2> ...'); process.exit(1); }
for (const f of files) {
  try { restoreFile(f); }
  catch (e) { console.error(`[${f}] FAILED: ${e.message}`); }
}
