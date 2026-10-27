<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex flex-col items-center justify-center h-screen">
<h1 class="text-9xl font-bold">{page.status}</h1>
<h2 class="text-4xl">{page.error?.message}</h2>
</div>