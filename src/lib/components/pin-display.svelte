<script lang="ts">
	import { game, PIN_LENGTH, reset, submit } from "$lib/stores/game.svelte";
	import { hover } from "$lib/stores/hover.svelte";

	const slots = Array.from({ length: PIN_LENGTH }, (_, i) => i);

	let showHint = $state(false);

	// the value the next ball you drop needs to be
	const nextLetter = $derived(game.target[game.dropped] ?? "");
	const hintAvailable = $derived(game.dropped < PIN_LENGTH);
	// every slot has a settled ball → the pin can be submitted
	const ready = $derived(game.entered.every((c) => c !== ""));

	const choose = (e: MouseEvent) => {
		e.stopPropagation(); // don't also release a ball
		showHint = false;
		reset();
	};

	const requestHint = (e: MouseEvent) => {
		e.stopPropagation();
		showHint = true;
	};

	const dismissHint = (e: MouseEvent) => {
		e.stopPropagation();
		showHint = false;
	};

	const onSubmit = (e: MouseEvent) => {
		e.stopPropagation();
		submit();
	};

	// Enter submits the pin (submit() no-ops unless it's full and still playing)
	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === "Enter") submit();
	};
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="pointer-events-none fixed inset-0 flex flex-col items-center justify-center gap-8 select-none"
>
	{#if game.status !== "playing"}
		<!-- result replaces the input content in place -->
		<div class="flex flex-col items-center gap-4">
			{#if game.status === "success"}
				<div class="flex flex-col items-center gap-2">
					<span class="text-xs tracking-[0.3em] text-white/40 uppercase">Access granted</span>
					<span class="text-2xl font-medium text-white/70">You have won nothing</span>
				</div>
			{:else}
				<div class="flex flex-col items-center gap-1">
					<span class="text-3xl font-semibold text-white">Access denied</span>
					<span class="text-sm text-white/50">
						You entered {game.entered.join("")} — the pin was {game.target}
					</span>
				</div>
			{/if}
			<button
				class="pointer-events-auto mt-2 min-w-40 cursor-pointer rounded-lg bg-white px-10 py-2 font-medium text-black"
				onclick={choose}
			>
				Play again
			</button>
		</div>
	{:else if showHint}
		<div class="flex flex-col items-center gap-4">
			<div class="flex flex-col items-center gap-2">
				<span class="text-xs tracking-[0.3em] text-white/40 uppercase">Hint</span>
				<span class="text-2xl font-medium text-white/70">
					{#if hintAvailable}
						Your next letter is {nextLetter}
					{:else}
						Not available
					{/if}
				</span>
			</div>
			<button
				class="pointer-events-auto min-w-40 cursor-pointer rounded-lg bg-white px-10 py-2 font-medium text-black"
				onclick={dismissHint}
			>
				OK
			</button>
		</div>
	{:else}
		<!-- the pin the player has to reproduce -->
		<div class="flex flex-col items-center gap-2">
			<span class="text-xs tracking-[0.3em] text-white/40 uppercase">Enter your pin</span>
			<div class="flex gap-2 text-2xl font-medium tracking-[0.3em] text-white/70">
				{#each game.target.split("") as letter}
					<span>{letter}</span>
				{/each}
			</div>
		</div>

		<!-- the player's entry, with the hint aligned to its left edge -->
		<div class="flex flex-col gap-3">
			<div class="flex gap-3">
				{#each slots as i}
					{@const correct = game.entered[i] !== "" && game.entered[i] === game.target[i]}
					<div
						class="flex h-16 w-12 items-center justify-center rounded-xl border text-2xl font-semibold text-white transition-colors
							{correct ? 'border-emerald-500/25' : i === game.dropped ? 'border-white/60' : 'border-white/20'}
							{correct ? 'bg-emerald-500/5' : hover.slot === i ? 'bg-white/10' : ''}"
					>
						{game.entered[i] ?? ""}
					</div>
				{/each}

				<!-- submit: looks like a faint input until every slot is settled, then
					 fills solid white with a black arrow -->
				<button
					aria-label="Submit pin"
					disabled={!ready}
					onclick={onSubmit}
					class="pointer-events-auto flex h-16 w-12 items-center justify-center rounded-xl border transition-colors
						{ready
						? 'cursor-pointer border-white bg-white text-black'
						: 'cursor-default border-white/20 bg-transparent text-white/30'}"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-6 w-6"
					>
						<path d="M5 12h14M13 6l6 6-6 6" />
					</svg>
				</button>
			</div>
			<p class="text-sm text-neutral-500">
				Stuck? Try a
				<button
					class="pointer-events-auto cursor-pointer text-neutral-300 hover:underline"
					onclick={choose}
				>
					new pin
				</button>
				or request a
				<button
					class="pointer-events-auto cursor-pointer text-neutral-300 hover:underline"
					onclick={requestHint}
				>
					hint
				</button>
			</p>
		</div>
	{/if}
</div>
