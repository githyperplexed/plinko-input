<script lang="ts">
	import Github from "$lib/components/icons/github.svelte";
	import Youtube from "$lib/components/icons/youtube.svelte";

	const links = [
		{
			href: "https://github.com/githyperplexed/plinko-input",
			label: "View the source on GitHub",
			icon: Github
		},
		{
			href: "https://youtu.be/-ZHMpxN2jUg",
			label: "Watch the video on YouTube",
			icon: Youtube
		}
	];
</script>

<!-- external project links (source + video), shown as muted icon buttons -->
<div class="flex items-center gap-1.5">
	{#each links as { href, label, icon: Icon }}
		<a
			{href}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={label}
			class="pointer-events-auto rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-300"
			onclick={(e) => e.stopPropagation()}
		>
			<Icon />
		</a>
	{/each}
</div>
