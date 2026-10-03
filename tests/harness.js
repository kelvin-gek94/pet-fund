// Minimal browser test harness. Test files call test(); index.html calls run().
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeep(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ': ' : ''}expected ${e}, got ${a}`);
}

export async function run(el) {
  const failures = [];
  for (const t of tests) {
    try {
      await t.fn();
    } catch (err) {
      failures.push(`FAIL: ${t.name}\n  ${err.message}`);
    }
  }
  el.textContent = failures.length
    ? `${failures.join('\n')}\n\n${failures.length} of ${tests.length} failed`
    : `ALL PASS (${tests.length})`;
}
