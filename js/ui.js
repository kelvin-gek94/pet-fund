// Small DOM helpers shared by the views.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// <option> list; `none` adds a first option with value "" (e.g. "All pets").
export function options(list, selected, none) {
  const first = none ? `<option value="">${esc(none)}</option>` : '';
  return first + list.map(x =>
    `<option value="${esc(x.id)}"${x.id === selected ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
}

// Bottom sheet; returns a close() function. `body` is an HTML string.
export function openSheet(body) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${body}</div>`;
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });
  document.body.append(back);
  return { el: back.querySelector('.sheet'), close };
}

export function shortDate(date) {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

// Picker items: active ones, plus the record's current value if it has since been hidden,
// so editing an old entry never silently swaps it for the first option.
export function choices(list, currentId) {
  const out = list.filter(x => x.active);
  const cur = list.find(x => x.id === currentId && !x.active);
  return cur ? [...out, { ...cur, name: `${cur.name} (hidden)` }] : out;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(month) {
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}
