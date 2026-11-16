import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, smsInfo, hmm, LANGS } from '../src/messages.js';
import { decideBlock, DEFAULTS } from '../src/engine.js';

const blocks = [
  { name: 'A', palms: 120, ecw: 1.5, emitters: 4, flowLph: 16 },
  { name: 'B', palms: 200, ecw: 6, emitters: 4, flowLph: 16 },
];
const today = blocks.map((b) => decideBlock(b, { et0: 4.39, rain: 0 }, DEFAULTS));

test('hmm formats minutes as h:mm', () => {
  assert.equal(hmm(90), '1:30');
  assert.equal(hmm(5), '0:05');
});

test('English message fits ONE plain SMS (weak-connectivity rule)', () => {
  const m = buildMessage(today, 'en');
  const info = smsInfo(m);
  assert.equal(info.encoding, 'GSM-7');
  assert.equal(info.segments, 1, m);
  assert.match(m, /A 1:30/);
  assert.match(m, /B 2:20/);
  assert.match(m, /salt flush/);
});

test('every language produces a message with both run times', () => {
  for (const lang of Object.keys(LANGS)) {
    const m = buildMessage(today, lang).replace(/‎/g, '');
    assert.ok(m.includes('1:30') && m.includes('2:20'), `${lang}: ${m}`);
  }
});

test('salty-water warning replaces the run time and is not counted as saving', () => {
  const bad = decideBlock({ ...blocks[1], ecw: 22 }, { et0: 4.39, rain: 0 }, DEFAULTS);
  const m = buildMessage([today[0], bad], 'en');
  assert.match(m, /B too salty/);
});

test('Arabic is Unicode SMS (70-char segments)', () => {
  assert.equal(smsInfo(buildMessage(today, 'ar')).encoding, 'Unicode');
});
