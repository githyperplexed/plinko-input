<script lang="ts">
	import { clampStageWidth, stageOffset } from "$lib/physics";
	import { game } from "$lib/stores/game.svelte";
	import { pegs } from "$lib/stores/pegs.svelte";
	import { settings } from "$lib/stores/settings.svelte";

	let innerWidth = $state(0);
	// handles sit at the edges of the (capped, centered) play area
	const stageX = $derived(stageOffset(innerWidth));
	const stageW = $derived(clampStageWidth(innerWidth));
	const handles = $derived([
		{ left: stageX, tx: "0", round: "rounded-r" }, // left edge, protrudes right
		{ left: stageX + stageW, tx: "-100%", round: "rounded-l" } // right edge, protrudes left
	]);

	const onDown = (e: PointerEvent) => {
		e.preventDefault(); // no text selection / native drag
		pegs.dragging = true;
		document.body.style.cursor = "grabbing"; // hold the cursor even off the handle
	};

	const onMove = (e: PointerEvent) => {
		if (!pegs.dragging) return;
		// clamp into [max (top), min (bottom)] — bounds maintained by the scene
		pegs.y = Math.min(pegs.min, Math.max(pegs.max, e.clientY));
	};

	const onUp = () => {
		if (!pegs.dragging) return;
		pegs.dragging = false;
		document.body.style.cursor = "";
	};
</script>

<svelte:window bind:innerWidth onpointermove={onMove} onpointerup={onUp} />

<!-- handles need pegs to ride on, so they only appear when both are switched on -->
{#if game.status === "playing" && settings.pegs && settings.railHandles}
	{#each handles as h}
		<button
			aria-label="Drag the plinko row"
			class="fixed z-20 flex h-10 w-3 touch-none flex-col items-center justify-center gap-1 bg-neutral-400 {h.round}"
			class:cursor-grab={!pegs.dragging}
			class:cursor-grabbing={pegs.dragging}
			style="left: {h.left}px; top: {pegs.y}px; transform: translate({h.tx}, -50%)"
			onpointerdown={onDown}
		>
			<!-- grip dots -->
			<span class="h-1 w-1 rounded-full bg-neutral-600"></span>
			<span class="h-1 w-1 rounded-full bg-neutral-600"></span>
			<span class="h-1 w-1 rounded-full bg-neutral-600"></span>
		</button>
	{/each}
{/if}
