<script lang="ts">
	import { clampStageWidth, MAX_AIM, stageOffset } from "$lib/physics";
	import { apparatus } from "$lib/stores/apparatus.svelte";
	import { launchBall } from "$lib/stores/balls";
	import { charset } from "$lib/stores/charset.svelte";
	import { game, CODE_LENGTH } from "$lib/stores/game.svelte";
	import { FIRE_BAR_HEIGHT, touch } from "$lib/stores/touch.svelte";

	let innerWidth = $state(0);
	// the bar spans the (capped, centered) play area, matching the canvas above it
	const stageX = $derived(stageOffset(innerWidth));
	const stageW = $derived(clampStageWidth(innerWidth));
	const cupWidth = $derived(stageW / charset.values.length);
	// every slot filled → nothing left to fire
	const ready = $derived(game.dropped < CODE_LENGTH);

	// Launch a ball along the cannon's current aim. Driven by the button so it never
	// touches apparatus.x / angle — the shot fires without disturbing the arc.
	const onFire = () => {
		if (game.status !== "playing") return;
		launchBall(cupWidth, CODE_LENGTH); // no-op when full
	};

	// Fine-aim nudge: precise on a tap, accelerating while held. A fingertip can't
	// drag to a pixel-perfect angle, so these dial it in deterministically.
	const STEP = (0.5 * Math.PI) / 180; // 0.5° per tap — the smallest visible nudge
	const HOLD_DELAY = 350; // ms a button must be held before it starts repeating
	const REPEAT_MS = 28; // repeat cadence while held

	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let repeatTimer: ReturnType<typeof setInterval> | null = null;

	const clampAim = (a: number) => Math.max(-MAX_AIM, Math.min(MAX_AIM, a));
	// dir: -1 aims left, +1 aims right (matches apparatus.angle's sign convention)
	const nudge = (dir: number, mult = 1) => {
		apparatus.angle = clampAim(apparatus.angle + dir * STEP * mult);
	};

	const startNudge = (e: PointerEvent, dir: number) => {
		e.preventDefault();
		nudge(dir); // one exact step immediately, so a quick tap is precise
		holdTimer = setTimeout(() => {
			let mult = 1;
			repeatTimer = setInterval(() => {
				mult = Math.min(mult + 0.2, 6); // ramp up to ~3°/tick for fast sweeps
				nudge(dir, mult);
			}, REPEAT_MS);
		}, HOLD_DELAY);
	};
	const stopNudge = () => {
		if (holdTimer) clearTimeout(holdTimer);
		if (repeatTimer) clearInterval(repeatTimer);
		holdTimer = repeatTimer = null;
	};

	// the two fine-aim arrows flanking the Fire button (chevron path + aim direction)
	const arrows = [
		{ dir: -1, label: "Aim left", d: "M15 18l-6-6 6-6" },
		{ dir: 1, label: "Aim right", d: "M9 6l6 6-6 6" }
	];
</script>

<svelte:window bind:innerWidth onpointerup={stopNudge} onpointercancel={stopNudge} />

{#if touch.coarse && game.status === "playing"}
	<!-- mobile-only control bar: sits in the band below the raised floor, isolated.
		 fine-aim arrows to the left of the Fire button, all sharing one height/style -->
	<div
		class="fixed bottom-0 z-20 flex touch-none items-center gap-2 px-4 select-none"
		style="left: {stageX}px; width: {stageW}px; height: {FIRE_BAR_HEIGHT}px"
	>
		{#each arrows as arrow}
			<button
				aria-label={arrow.label}
				onpointerdown={(e) => startNudge(e, arrow.dir)}
				class="flex cursor-pointer items-center justify-center rounded-lg bg-white px-5 py-3 text-black"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5"
				>
					<path d={arrow.d} />
				</svg>
			</button>
		{/each}
		<button
			disabled={!ready}
			onclick={onFire}
			class="flex-1 rounded-lg py-3 font-medium transition-colors
				{ready ? 'cursor-pointer bg-white text-black' : 'cursor-default bg-white/20 text-white/40'}"
		>
			Fire
		</button>
	</div>
{/if}
