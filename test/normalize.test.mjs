import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const normalizeCode = readFileSync(join(__dirname, '../extension/normalize.js'), 'utf8');

function loadNormalize() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(normalizeCode, context);
  return context.window.ZGM_NORMALIZE;
}

const { parseAddress, addressFromSlug } = loadNormalize();

test('parseAddress: standard residential flat with prefix and slashes', () => {
  const res = parseAddress('ul. Zygmunta Starego 29/4');
  assert.equal(res.street, 'Zygmunta Starego');
  assert.equal(res.street_norm, 'zygmunta starego');
  assert.equal(res.building, '29');
  assert.equal(res.apt, '4');
  assert.equal(res.key, 'zygmunta starego|29|4');
});

test('parseAddress: strips diacritics in street_norm', () => {
  const res = parseAddress('ul. Pszczyńska 10/2');
  assert.equal(res.street, 'Pszczyńska');
  assert.equal(res.street_norm, 'pszczynska');
  assert.equal(res.building, '10');
  assert.equal(res.apt, '2');
  assert.equal(res.key, 'pszczynska|10|2');
});

test('parseAddress: handles building suffixes and Roman numerals', () => {
  const res = parseAddress('pl. Krakowski 12A/IV');
  assert.equal(res.street, 'Krakowski');
  assert.equal(res.building, '12A');
  assert.equal(res.apt, 'IV');
  assert.equal(res.key, 'krakowski|12A|IV');
});

test('parseAddress: garage format', () => {
  const res = parseAddress('Kochanowskiego 5 garaż nr 2');
  assert.equal(res.street, 'Kochanowskiego');
  assert.equal(res.building, '5');
  assert.equal(res.apt, 'garaz-2');
  assert.equal(res.key, 'kochanowskiego|5|garaz-2');
});

test('parseAddress: null and empty input handling', () => {
  assert.equal(parseAddress(null), null);
  assert.equal(parseAddress(''), null);
  assert.equal(parseAddress('   '), null);
});

test('addressFromSlug: standard listing slug', () => {
  const res = addressFromSlug('/zygmunta-starego-29-4-23-03-2026-r/');
  assert.equal(res, 'Zygmunta Starego 29/4');
});

test('addressFromSlug: garage listing slug', () => {
  const res = addressFromSlug('/kozielska-13-garaz-nr-1-23-03-2026-r/');
  assert.equal(res, 'Kozielska 13 garaż nr 1');
});

test('addressFromSlug: standalone building slug', () => {
  const res = addressFromSlug('/lipowa-5-23-03-2026-r/');
  assert.equal(res, 'Lipowa 5');
});

test('addressFromSlug: invalid slug returns null', () => {
  assert.equal(addressFromSlug('/invalid-url-path/'), null);
});

test('data integrity: properties.json, active.json, meta.json', () => {
  const propsRaw = readFileSync(join(__dirname, '../data/gliwice/properties.json'), 'utf8');
  const props = JSON.parse(propsRaw);
  assert.ok(Array.isArray(props) || typeof props === 'object');

  const activeRaw = readFileSync(join(__dirname, '../data/gliwice/active.json'), 'utf8');
  const active = JSON.parse(activeRaw);
  assert.ok(active !== null);

  const metaRaw = readFileSync(join(__dirname, '../data/gliwice/meta.json'), 'utf8');
  const meta = JSON.parse(metaRaw);
  assert.equal(meta.city, 'gliwice');
  assert.ok(meta.generated_at);
});

test('manifest.json: valid MV3 schema', () => {
  const manifestRaw = readFileSync(join(__dirname, '../extension/manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name);
  assert.ok(manifest.version);
  assert.ok(manifest.action);
});
