<script lang="ts">
	import { page } from "$app/state";
</script>

<div class="flex min-h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center">
	<h1 class="text-6xl font-bold">{page.status}</h1>
	<h2 class="text-2xl">{page.error?.message}</h2>
</div>
