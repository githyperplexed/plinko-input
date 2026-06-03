<script lang="ts">
	import { pegs } from "$lib/stores/pegs.svelte";

	const sides = ["left", "right"] as const;

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

<svelte:window onpointermove={onMove} onpointerup={onUp} />

{#each sides as side}
	<button
		aria-label="Drag the plinko row"
		class="fixed z-20 flex h-10 w-3 -translate-y-1/2 touch-none flex-col items-center justify-center gap-1 bg-neutral-400
			{side === 'left' ? 'left-0 rounded-r' : 'right-0 rounded-l'}"
		class:cursor-grab={!pegs.dragging}
		class:cursor-grabbing={pegs.dragging}
		style="top: {pegs.y}px"
		onpointerdown={onDown}
	>
		<!-- grip dots -->
		<span class="h-1 w-1 rounded-full bg-neutral-600"></span>
		<span class="h-1 w-1 rounded-full bg-neutral-600"></span>
		<span class="h-1 w-1 rounded-full bg-neutral-600"></span>
	</button>
{/each}
