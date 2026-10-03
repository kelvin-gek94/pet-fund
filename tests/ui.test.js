import { test, assertDeep } from './harness.js';
import { choices } from '../js/ui.js';

const list = [
  { id: 'a', name: 'Murphy', active: true },
  { id: 'b', name: 'Panda', active: false },
  { id: 'c', name: 'Watson', active: true },
];

test('choices: active items only when current is active or empty', () => {
  assertDeep(choices(list, 'a').map(x => x.name), ['Murphy', 'Watson']);
  assertDeep(choices(list, null).map(x => x.name), ['Murphy', 'Watson']);
});

test('choices: keeps an inactive current value, labelled hidden', () => {
  assertDeep(choices(list, 'b').map(x => [x.id, x.name]), [['a', 'Murphy'], ['c', 'Watson'], ['b', 'Panda (hidden)']]);
});
