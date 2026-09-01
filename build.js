/* Zero-dependency build: assembles src/ into one self-contained HTML file.
 *
 * The published artifact must be a single file with no external scripts
 * (the CSP on published artifacts blocks them), so instead of a bundler
 * this just concatenates the numbered src/js/*.js files — the numbering
 * gives the order — and inlines them and the stylesheet into the template.
 *
 * Run: node build.js   (or require('./build.js').build())
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist', 'desk-duel.html');

function build() {
  const tpl = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');

  const jsDir = path.join(ROOT, 'src', 'js');
  const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
  const js = files.map((f) =>
    `/* ══ ${f} ${'═'.repeat(Math.max(1, 66 - f.length))} */\n` +
    fs.readFileSync(path.join(jsDir, f), 'utf8').trimEnd()
  ).join('\n\n');

  const out = tpl
    // function replacements: a plain string replacement would corrupt
    // content containing $& / $' sequences
    .replace('<!--@css@-->', () => `<style>\n${css.trim()}\n</style>`)
    .replace('<!--@js@-->', () => `<script>\n${js}\n</script>`);

  fs.mkdirSync(path.dirname(DIST), { recursive: true });
  fs.writeFileSync(DIST, out);
  return DIST;
}

if (require.main === module) {
  const out = build();
  console.log(`built ${path.relative(process.cwd(), out)} (${fs.statSync(out).size} bytes)`);
}

module.exports = { build };
