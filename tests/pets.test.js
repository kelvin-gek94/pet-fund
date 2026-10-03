import { test, assert, assertEqual } from './harness.js';
import { COATS, coatOf, petColor, inkOn, coatSvg } from '../js/pets.js';
import { coveredSentence, monthCostSentence } from '../js/words.js';

test('coatOf falls back to plain for unknown or missing coats', () => {
  assertEqual(coatOf({ coat: 'tuxedo' }), 'tuxedo');
  assertEqual(coatOf({ coat: 'zebra' }), 'plain');
  assertEqual(coatOf({}), 'plain');
  assert(COATS.some(c => c.id === 'pomeranian') && COATS.some(c => c.id === 'tricolour'), 'coat list');
});

test('petColor uses the saved colour, else a palette colour by position', () => {
  const pets = [{ id: 'a', color: '#123456' }, { id: 'b' }, { id: 'c' }];
  assertEqual(petColor(pets[0], pets), '#123456');
  assert(/^#[0-9A-F]{6}$/i.test(petColor(pets[1], pets)), 'palette hex');
  assert(petColor(pets[1], pets) !== petColor(pets[2], pets), 'different pets get different colours');
});

test('inkOn picks readable text for a tag colour', () => {
  assertEqual(inkOn('#E39B2D'), '#1E2B2A');   // marigold: dark text
  assertEqual(inkOn('#3E6FB0'), '#FFFFFF');   // blue: white text
});

test('coatSvg draws every coat and escapes nothing user-controlled', () => {
  for (const c of COATS) assert(coatSvg(c.id, 20).startsWith('<svg'), c.id);
  assert(coatSvg('<script>', 20).startsWith('<svg'), 'unknown coat still draws plain');
});

test('coveredSentence answers "are the pets covered?"', () => {
  assertEqual(coveredSentence({ months: 7.2, belowReserve: false }), 'The pets are covered for about 7 months.');
  assertEqual(coveredSentence({ months: 1.4, belowReserve: false }), 'The pets are covered for about 1 month.');
  assertEqual(coveredSentence({ months: 0.4, belowReserve: false }), 'The pets are covered for less than a month.');
  assertEqual(coveredSentence({ months: 0, belowReserve: true }), 'The fund is below the reserve.');
  assertEqual(coveredSentence({ months: null, belowReserve: false }), 'No spending yet, so nothing to measure.');
});

test('monthCostSentence', () => {
  assertEqual(monthCostSentence('2026-10', 29310), 'October cost RM 293.10.');
  assertEqual(monthCostSentence('2026-10', 0), 'Nothing spent in October yet.');
});

test('petTag escapes pet names and shows off/on state', async () => {
  const { petTag } = await import('../js/pets.js');
  const pets = [{ id: 'p1', name: '<b>Mo</b>', coat: 'tabby', color: '#D9688F' }];
  const html = petTag(pets[0], pets, { button: true, on: false, amount: 'RM 5' });
  assert(html.includes('&lt;b&gt;Mo&lt;/b&gt;'), 'escaped name');
  assert(html.includes('pettag') && html.includes(' off'), 'off state');
  assert(html.includes('aria-pressed="false"'), 'pressed state');
});
