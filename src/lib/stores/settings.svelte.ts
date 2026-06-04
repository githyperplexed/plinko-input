// Player-toggleable display/assist switches. Each flips a single visual or
// control aid live, without touching game state (balls, progress, target), so
// they can be changed at any point during play. Persisted to localStorage so the
// choices survive a reload. The settings dialog edits a draft copy and commits
// it through `saveSettings` on Save; the live game reads this store every frame.

export type Settings = {
	guideline: boolean; // the dotted aim-trajectory preview
	guidelineBounces: number; // how many collisions the guideline traces (1–10)
	onTargetGlow: boolean; // green guideline + mound glow + letter when the aim is on target
	pegs: boolean; // the floating pegs (off also removes them as physics obstacles)
	railHandles: boolean; // the rail line + side handles, and the ability to reposition the row
};

export const MIN_BOUNCES = 1;
export const MAX_BOUNCES = 10;

// snap an arbitrary value to a whole step within the allowed bounce range
export const clampBounces = (n: number): number =>
	Math.min(MAX_BOUNCES, Math.max(MIN_BOUNCES, Math.round(Number(n) || MIN_BOUNCES)));

const STORAGE_KEY = "plinko-input:settings";
const DEFAULTS: Settings = {
	guideline: true,
	guidelineBounces: 3,
	onTargetGlow: true,
	pegs: true,
	railHandles: true
};

// Read the saved settings, falling back to the defaults for anything missing or
// unparseable (corrupt value, private mode, no localStorage).
const load = (): Settings => {
	if (typeof localStorage === "undefined") return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULTS };
		const merged = { ...DEFAULTS, ...JSON.parse(raw) };
		// guard the one numeric field against a corrupt/out-of-range stored value
		merged.guidelineBounces = clampBounces(merged.guidelineBounces);
		return merged;
	} catch {
		return { ...DEFAULTS };
	}
};

export const settings = $state<Settings>(load());

// Whether the settings dialog is showing. Lives here so the trigger (under the
// code display) and the dialog (mounted at the app root) can share it.
export const settingsDialog = $state({ open: false });

// Commit a draft into the live store and persist it (best-effort).
export const saveSettings = (next: Settings): void => {
	Object.assign(settings, next);
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// ignore — private mode / quota; the in-memory settings still apply
	}
};
