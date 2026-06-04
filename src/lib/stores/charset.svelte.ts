// The set of values a code can be built from, chosen by viewport width so the
// board stays roomy as the screen shrinks. The active set drives the number of
// cups, the cannon width, and the target code.
//   ≥ 3xl       → a–z (26)
//   xl … < 3xl  → a–r (18)
//   md … < xl   → 0–9 (10)
//   < md        → 0–5 (6)

export const MD = 768; // tailwind's md
export const XL = 1280; // tailwind's xl
export const XXXL = 1920; // 3xl (no tailwind default; common convention)

const ALPHA = "abcdefghijklmnopqrstuvwxyz".split("");
const ALPHA_18 = ALPHA.slice(0, 18); // first 18 letters, a–r
const DIGITS = "0123456789".split("");
const FEW = "012345".split("");

const setFor = (width: number): string[] =>
	width >= XXXL ? ALPHA : width >= XL ? ALPHA_18 : width >= MD ? DIGITS : FEW;

const initialWidth = typeof window === "undefined" ? XXXL : window.innerWidth;

export const charset = $state({
	values: setFor(initialWidth)
});

// remembers the active set, so a swap fires once per breakpoint crossing and
// never on plain resizes within the same range
let current = charset.values;

// Update the active set for a new viewport width. Returns true ONLY when the
// set actually changed (a breakpoint was crossed), so callers can reset once.
export const syncCharset = (width: number): boolean => {
	const next = setFor(width);
	if (next === current) return false;
	current = next;
	charset.values = next;
	return true;
};
