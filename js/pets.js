// Pet identity: each pet has a coat (drawn as a small round mark) and a tag colour.

export const COATS = [
  { id: 'pomeranian', label: 'Pomeranian (fluffy orange)' },
  { id: 'tuxedo', label: 'Tuxedo (black and white)' },
  { id: 'tabby', label: 'Tabby (striped)' },
  { id: 'bicolour', label: 'Bi-colour tabby (brown and white)' },
  { id: 'tricolour', label: 'Tri-colour' },
  { id: 'plain', label: 'Plain' },
];

// Tag enamels, assigned by position when a pet has no colour of its own.
export const PET_PALETTE = ['#3E6FB0', '#6B5CA8', '#3B8F7A', '#D9688F', '#E39B2D', '#5E8C3A', '#B5452F', '#2F7FA3'];

const INK = '#1E2B2A';
const WHITE = '#FFFFFF';

export const coatOf = pet => (COATS.some(c => c.id === pet?.coat) ? pet.coat : 'plain');

export function petColor(pet, pets) {
  if (/^#[0-9a-f]{6}$/i.test(pet?.color ?? '')) return pet.color;
  const i = Math.max(0, pets.findIndex(p => p.id === pet?.id));
  return PET_PALETTE[i % PET_PALETTE.length];
}

// Dark ink on light enamels (marigold), white on everything else.
export function inkOn(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? INK : WHITE;
}

const DRAW = {
  pomeranian: '<circle cx="12" cy="12" r="11" fill="#D9822B"/><circle cx="12" cy="13.5" r="6" fill="#F2C38A"/>'
    + '<circle cx="9.5" cy="12" r="1.1" fill="#2A1A0E"/><circle cx="14.5" cy="12" r="1.1" fill="#2A1A0E"/>',
  tuxedo: '<circle cx="12" cy="12" r="11" fill="#22262A"/><path d="M12 9 L17.5 22 Q12 23.5 6.5 22 Z" fill="#FFFFFF"/>'
    + '<circle cx="9" cy="9.5" r="1.1" fill="#C9E86A"/><circle cx="15" cy="9.5" r="1.1" fill="#C9E86A"/>',
  tabby: '<circle cx="12" cy="12" r="11" fill="#9A8A74"/>'
    + '<path d="M5 7 Q12 10 19 7 M3.5 12 Q12 15 20.5 12 M5 17 Q12 20 19 17" stroke="#5C4E3D" stroke-width="1.6" fill="none"/>',
  bicolour: '<circle cx="12" cy="12" r="11" fill="#FFFFFF" stroke="#D9CFC3"/><path d="M12 1 A11 11 0 0 0 12 23 Z" fill="#8B5A33"/>'
    + '<path d="M4 8 Q8 9 12 8 M3 13 Q8 14 12 13" stroke="#5A3920" stroke-width="1.4" fill="none"/>',
  tricolour: '<circle cx="12" cy="12" r="11" fill="#FFFFFF" stroke="#D9CFC3"/><path d="M3 9 Q7 3 13 3 Q11 9 3 12 Z" fill="#22262A"/>'
    + '<path d="M14 4 Q21 7 21 13 Q16 12 13 8 Z" fill="#D9822B"/><path d="M9 19 Q13 15 17 19 Q13 22 9 19 Z" fill="#22262A"/>',
  plain: '<circle cx="12" cy="12" r="11" fill="#C9C2B6"/><circle cx="12" cy="14.5" r="3.2" fill="#8C8578"/>'
    + '<circle cx="8" cy="9.5" r="1.6" fill="#8C8578"/><circle cx="12" cy="8" r="1.6" fill="#8C8578"/><circle cx="16" cy="9.5" r="1.6" fill="#8C8578"/>',
};

export function coatSvg(coat, size = 20) {
  const body = DRAW[coat] ?? DRAW.plain;
  return `<svg class="coat" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// A collar tag: enamel colour, coat mark, name, and optionally an amount line.
// As a button (pet pickers) it can be shown "off" (outlined) when not chosen.
export function petTag(pet, pets, { amount = null, button = false, on = true, small = false } = {}) {
  const color = petColor(pet, pets);
  const attrs = button ? `type="button" data-pet="${escHtml(pet.id)}" aria-pressed="${on}"` : '';
  const el = button ? 'button' : 'span';
  return `<${el} class="pettag${small ? ' small' : ''}${on ? '' : ' off'}" style="background:${color};color:${inkOn(color)}" ${attrs}>`
    + `${coatSvg(coatOf(pet), small ? 18 : 22)}<span><span class="name">${escHtml(pet.name)}</span>`
    + `${amount != null ? `<span class="amt">${escHtml(amount)}</span>` : ''}</span></${el}>`;
}

// Overlapping coat marks for the pets in an entry (e.g. History rows).
export function coatStack(petIds, pets, size = 20) {
  const marks = petIds.map(id => pets.find(p => p.id === id)).filter(Boolean).map(p => coatSvg(coatOf(p), size));
  return `<span class="coats">${marks.length ? marks.join('') : coatSvg('plain', size)}</span>`;
}
