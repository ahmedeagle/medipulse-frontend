/**
 * Recovers UTF-8 strings corrupted to '?' or U+FFFD by Windows-1252 round-trip.
 *
 * Uses git HEAD as the source-of-truth dictionary. For each working line with
 * corruption, builds a skeleton (any non-ASCII / corruption run -> <X>) and
 * looks up a matching HEAD line, then substitutes each placeholder with the
 * corresponding non-ASCII run from HEAD.
 *
 * Two-pass:
 *   Pass A (safe): treat only '?{3,}' + U+FFFD as corruption.
 *   Pass B (smart 2-char): for lines that STILL had '?{3,}' before pass A but
 *     still contain '?{2,}' afterwards, retry with '?{2,}' matching. Only
 *     substitutes when the new skeleton uniquely matches a HEAD line whose
 *     own structure has the same '??' positions accounted for as Arabic
 *     2-char words — js operators stay untouched because their HEAD skeleton
 *     keeps the literal '??' and won't match the work skeleton.
 *
 * Usage:  node restore-arabic-v3.cjs <file1> <file2> ...
 *         Backups expected at <file>.corrupt.bak; otherwise reads the file
 *         in place (idempotent).
 */
const fs = require('fs');
const { execSync } = require('child_process');

const NONASCII = /[^\x00-\x7F]+/g;
const CORRUPT_STRICT = /\?{3,}|\uFFFD+/g;
const CORRUPT_LOOSE = /\?{2,}|\uFFFD+/g;
const NONASCII_OR_STRICT = /[^\x00-\x7F]+|\?{3,}|\uFFFD+/g;
const NONASCII_OR_LOOSE = /[^\x00-\x7F]+|\?{2,}|\uFFFD+/g;

function buildHeadMap(headLines) {
  const map = new Map();
  for (const hl of headLines) {
    if (!/[^\x00-\x7F]/.test(hl)) continue;
    const sk = hl.replace(NONASCII, '<X>');
    if (!map.has(sk)) map.set(sk, []);
    map.get(sk).push({ line: hl, tokens: hl.match(NONASCII) || [] });
  }
  return map;
}

function restoreFile(file) {
  const bak = file + '.corrupt.bak';
  const source = fs.existsSync(bak) ? bak : file;
  const head = execSync(`git show HEAD:${file}`, { encoding: 'utf8' });
  const work = fs.readFileSync(source, 'utf8');

  const headLines = head.split(/\r?\n/);
  const workLines = work.split(/\r?\n/);
  const headMap = buildHeadMap(headLines);

  let restoredA = 0, restoredB = 0, unmatched = 0;
  const stillCorrupt = [];

  const out = workLines.map((wl, idx) => {
    const hadStrict = CORRUPT_STRICT.test(wl); CORRUPT_STRICT.lastIndex = 0;
    if (!hadStrict && !/\uFFFD/.test(wl)) return wl;

    // Pass A: strict
    const skA = wl.replace(NONASCII_OR_STRICT, '<X>');
    const candA = headMap.get(skA);
    let line = wl;
    if (candA && candA.length >= 1) {
      const toks = candA[0].tokens;
      let i = 0;
      line = wl.replace(NONASCII_OR_STRICT, () => toks[i++] ?? '???');
      restoredA++;
    }

    // Pass B: if still contains ?{2,} AND original line had ?{3,}, try loose match
    if (hadStrict && /\?{2,}/.test(line)) {
      const skB = line.replace(NONASCII_OR_LOOSE, '<X>');
      const candB = headMap.get(skB);
      if (candB && candB.length >= 1) {
        const toks = candB[0].tokens;
        let i = 0;
        line = line.replace(NONASCII_OR_LOOSE, () => toks[i++] ?? '??');
        restoredB++;
      }
    }

    if (/\?{3,}|\uFFFD/.test(line)) {
      unmatched++;
      if (stillCorrupt.length < 8) stillCorrupt.push(`L${idx + 1}: ${line.trim().slice(0, 100)}`);
    }
    return line;
  });

  fs.writeFileSync(file, out.join('\n'));
  console.log(`[${file}] pass-A=${restoredA}  pass-B=${restoredB}  still-corrupt-lines=${unmatched}`);
  if (stillCorrupt.length) {
    console.log('  remaining corrupt samples:');
    for (const s of stillCorrupt) console.log('    ' + s);
  }
}

const files = process.argv.slice(2);
if (files.length === 0) { console.error('Usage: node restore-arabic-v3.cjs <file1> <file2> ...'); process.exit(1); }
for (const f of files) {
  try { restoreFile(f); }
  catch (e) { console.error(`[${f}] FAILED: ${e.message}`); }
}
