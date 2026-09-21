const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const reference = 'c69939a944fbf3df3173b36047239d8bc848a40a';
const spaces = value => value.replace(/\s+/g, ' ').trim();
const markup = value => spaces(value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ''));

for (const page of ['index', 'config', 'grid']) {
  test(`${page}: complete HTML, reference markup, styles and Tailwind theme preserved`, () => {
    const old = execFileSync('git', ['show', `${reference}:public/${page}.html`], { encoding: 'utf8' });
    const current = fs.readFileSync(`public/${page}.html`, 'utf8');
    assert.match(current, /<!DOCTYPE html>/i); assert.match(current, /<body\b/); assert.match(current, /<\/html>/);
    assert.equal(markup(current), markup(old));
    const oldStyle = spaces(old.match(/<style>([\s\S]*?)<\/style>/)[1]);
    assert(spaces(current.match(/<style>([\s\S]*?)<\/style>/)[1]).startsWith(oldStyle));
    const theme = value => value.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/)?.[1];
    assert.equal(theme(current), theme(old));
    for (const match of current.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
  });
}

test('channel card template retains reference markup and classes', () => {
  const old = execFileSync('git', ['show', `${reference}:public/grid.html`], { encoding: 'utf8' });
  const expected = old.match(/document\.write\(channels\.map\(ch => `([\s\S]*?)`\)\.join/)[1];
  const actual = fs.readFileSync('public/grid.js', 'utf8').match(/const channelMarkup = ch => `([\s\S]*?)`;/)[1];
  const normalize = value => spaces(value.replace(/\s+(?:onclick|ondblclick|role|tabindex|aria-label)="[^"]*"/g, ''));
  assert.equal(normalize(actual), normalize(expected));
});
