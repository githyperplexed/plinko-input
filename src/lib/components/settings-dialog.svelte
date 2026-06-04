<script lang="ts">
	import { cubicOut } from "svelte/easing";
	import { fade, scale } from "svelte/transition";

	import { game, reset } from "$lib/stores/game.svelte";
	import {
		MAX_BOUNCES,
		MIN_BOUNCES,
		PRESET_LABELS,
		PRESET_ORDER,
		PRESETS,
		saveSettings,
		settings,
		type Settings
	} from "$lib/stores/settings.svelte";

	type Props = { open: boolean; onClose: () => void };
	let { open, onClose }: Props = $props();

	// the boolean settings — the only ones driven by an on/off switch
	type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

	// A draft copy edited by the switches; committed on Save, discarded on Cancel.
	// Re-seeded from the live settings each time the dialog opens.
	let draft = $state<Settings>({ ...settings });
	$effect(() => {
		if (open) draft = { ...settings };
	});

	// the switch rows, grouped under section headers. key = which draft flag the
	// switch flips; the guideline section also gets the collisions slider (below).
	type Toggle = { key: BoolKey; label: string; hint: string };
	const sections: { title: string; toggles: Toggle[] }[] = [
		{
			title: "Aim guideline",
			toggles: [
				{ key: "guideline", label: "Show guideline", hint: "The dotted trajectory preview" },
				{
					key: "onTargetGlow",
					label: "On-target highlight",
					hint: "Green glow when the current aim is on target"
				}
			]
		},
		{
			title: "Peg rail",
			toggles: [
				{ key: "pegs", label: "Show pegs", hint: "The row of pegs the ball bounces off" },
				{ key: "railHandles", label: "Drag handles", hint: "Reposition the row of pegs" }
			]
		},
		{
			title: "Rules",
			toggles: [
				{
					key: "instantFail",
					label: "Instant fail",
					hint: "Lose the round the moment a ball lands in the wrong slot"
				}
			]
		}
	];

	// the rail handles are meaningless without pegs to put them on
	const railHandlesDisabled = $derived(!draft.pegs);

	// The active preset is whichever one the draft matches on every key the preset
	// controls; null means the draft is a one-off mix, shown as "Custom". Editing
	// any toggle below therefore flips this to Custom on its own.
	const activePreset = $derived(
		PRESET_ORDER.find((name) =>
			(Object.keys(PRESETS[name]) as (keyof Settings)[]).every((k) => draft[k] === PRESETS[name][k])
		) ?? null
	);
	// stamp a preset's values onto the draft (merge, so any future non-preset
	// setting is left untouched)
	const applyPreset = (name: keyof typeof PRESETS) => {
		draft = { ...draft, ...PRESETS[name] };
	};

	const save = () => {
		// Switching instant-fail ON mid-round would fail you on the spot for any ball
		// already misplaced under the old rules — a harsh way to flip a setting. So
		// when it's newly armed and a round is in progress, start fresh (new code,
		// cleared board) instead of dropping straight into the failure state.
		const armedInstantFail = !settings.instantFail && draft.instantFail;
		const midRound = game.dropped > 0 || game.status !== "playing";
		saveSettings(draft);
		if (armedInstantFail && midRound) reset();
		onClose();
	};

	const onKeydown = (e: KeyboardEvent) => {
		if (open && e.key === "Escape") onClose();
	};

	// subtle enter/exit: backdrop fades, the panel fades + eases up from 96%.
	// honour a reduced-motion preference by collapsing the duration to instant.
	const reduceMotion =
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
	const MS = reduceMotion ? 0 : 150;
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<!-- backdrop: dims + blurs the game behind; a click on it (not the content) cancels -->
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/90 p-4 backdrop-blur-xs"
		onclick={(e) => e.target === e.currentTarget && onClose()}
		onkeydown={onKeydown}
		role="presentation"
		transition:fade={{ duration: MS }}
	>
		<div
			class="flex max-h-full w-md max-w-full flex-col rounded-2xl border border-neutral-900 bg-black p-6 text-white"
			role="dialog"
			aria-modal="true"
			aria-label="Settings"
			tabindex="-1"
			transition:scale={{ duration: MS, start: 0.96, opacity: 0, easing: cubicOut }}
		>
			<div class="flex shrink-0 items-center justify-between">
				<h2 class="text-lg font-medium">Settings</h2>
				<button
					aria-label="Close settings"
					class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"
					onclick={onClose}
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-5 w-5"
					>
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- only the settings list scrolls; the title row and the Save/Cancel bar
			     stay pinned, so a short viewport can't clip them. -mr keeps the
			     scrollbar at the panel edge while the rows keep the p-6 inset. -->
			<div class="mt-5 -mr-3 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-3">
				<!-- difficulty presets: one click sets every toggle below. the right-hand
				     badge names the active preset, or "Custom" once you diverge from one. -->
				<div class="flex flex-col gap-3">
					<h3
						class="flex items-center gap-3 text-xs font-semibold tracking-[0.15em] text-neutral-500 uppercase"
					>
						Difficulty
						<span class="h-px grow bg-neutral-700"></span>
						<span class="font-medium tracking-normal text-neutral-400 normal-case">
							{activePreset ? PRESET_LABELS[activePreset] : "Custom"}
						</span>
					</h3>
					<div class="grid grid-cols-3 gap-2">
						{#each PRESET_ORDER as name}
							{@const active = activePreset === name}
							<button
								type="button"
								aria-pressed={active}
								onclick={() => applyPreset(name)}
								class="cursor-pointer rounded-lg border py-2 text-sm font-medium transition-colors
									{active
									? 'border-emerald-500 bg-emerald-500 text-black'
									: 'border-neutral-700 text-white hover:bg-white/5'}"
							>
								{PRESET_LABELS[name]}
							</button>
						{/each}
					</div>
				</div>

				{#each sections as section}
					<div class="flex flex-col gap-4">
						<h3
							class="flex items-center gap-3 text-xs font-semibold tracking-[0.15em] text-neutral-500 uppercase"
						>
							{section.title}
							<span class="h-px grow bg-neutral-700"></span>
						</h3>
						{#each section.toggles as t}
							{@const disabled = t.key === "railHandles" && railHandlesDisabled}
							<label class="flex items-center justify-between gap-4 {disabled ? 'opacity-40' : ''}">
								<span class="flex flex-col">
									<span class="text-sm font-medium">{t.label}</span>
									<span class="text-xs text-neutral-500">{t.hint}</span>
								</span>
								<button
									type="button"
									role="switch"
									aria-checked={draft[t.key]}
									aria-label={t.label}
									{disabled}
									onclick={() => (draft[t.key] = !draft[t.key])}
									class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors
										{disabled ? 'cursor-default' : 'cursor-pointer'}
										{draft[t.key] ? 'border-emerald-500 bg-emerald-500' : 'border-neutral-600 bg-neutral-700'}"
								>
									<span
										class="inline-block h-4 w-4 rounded-full bg-white transition-transform
											{draft[t.key] ? 'translate-x-6' : 'translate-x-1'}"
									></span>
								</button>
							</label>

							<!-- the guideline's bounce count: always shown, but disabled until the
							     guideline itself is switched on -->
							{#if t.key === "guideline"}
								{@const off = !draft.guideline}
								<div class="flex flex-col gap-2 {off ? 'opacity-40' : ''}">
									<span class="flex flex-col">
										<span class="text-sm font-medium">Collisions</span>
										<span class="text-xs text-neutral-500">How many bounces the line traces</span>
									</span>
									<div class="flex items-center gap-3">
										<input
											type="range"
											min={MIN_BOUNCES}
											max={MAX_BOUNCES}
											step="1"
											disabled={off}
											bind:value={draft.guidelineBounces}
											aria-label="Guideline collisions"
											class="range grow {off ? 'cursor-default' : ''}"
											style="--fill: {((draft.guidelineBounces - MIN_BOUNCES) /
												(MAX_BOUNCES - MIN_BOUNCES)) *
												100}%"
										/>
										<span class="w-4 text-right text-sm font-medium tabular-nums text-white">
											{draft.guidelineBounces}
										</span>
									</div>
								</div>
							{/if}
						{/each}
					</div>
				{/each}
			</div>

			<div class="mt-6 flex shrink-0 gap-3">
				<button
					class="flex-1 cursor-pointer rounded-lg border border-neutral-700 py-2 font-medium text-white hover:bg-white/5"
					onclick={onClose}
				>
					Cancel
				</button>
				<button
					class="flex-1 cursor-pointer rounded-lg bg-white py-2 font-medium text-black hover:bg-neutral-200"
					onclick={save}
				>
					Save
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* custom range slider: a thin pill track that fills emerald up to the white
	   thumb. --fill (set inline from the value) positions the WebKit gradient;
	   Firefox uses its native ::-moz-range-progress for the same effect. */
	.range {
		-webkit-appearance: none;
		appearance: none;
		height: 1rem; /* interactive height = the thumb */
		background: transparent;
		cursor: pointer;
		outline: none;
	}

	.range::-webkit-slider-runnable-track {
		height: 0.375rem;
		border-radius: 9999px;
		background: linear-gradient(to right, #10b981 var(--fill), #404040 var(--fill));
	}
	.range::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		height: 1rem;
		width: 1rem;
		margin-top: -0.3125rem; /* center the 16px thumb on the 6px track */
		border-radius: 9999px;
		background: #fff;
		border: 1px solid #737373;
	}

	.range::-moz-range-track {
		height: 0.375rem;
		border-radius: 9999px;
		background: #404040;
	}
	.range::-moz-range-progress {
		height: 0.375rem;
		border-radius: 9999px;
		background: #10b981;
	}
	.range::-moz-range-thumb {
		height: 1rem;
		width: 1rem;
		border-radius: 9999px;
		background: #fff;
		border: 1px solid #737373;
	}
</style>
