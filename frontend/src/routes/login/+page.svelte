<script lang="ts">
  import { authClient } from "$lib/auth-client";
  import { env } from "$env/dynamic/public";
  import { setPageTitle } from "$lib/utils";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { createLogger } from "$lib/logger";

  const logger = createLogger("login");

  onMount(() => {
    setPageTitle();
  });

  async function login() {
    const redirectTo = page.url.searchParams.get("redirect") ?? "/";
    logger.info("logging in with provider", { provider: env.PUBLIC_GNAGHOME_OAUTH_PROVIDER_ID || "gnagplus" });
    await authClient.signIn.social({
      provider: env.PUBLIC_GNAGHOME_OAUTH_PROVIDER_ID || "gnagplus",
      callbackURL: redirectTo,
    });
  }
</script>

<div class="h-screen w-screen flex items-center justify-center bg-surface-50-950">
  <div class="rounded-lg p-8 w-full max-w-md mx-4 bg-surface-50-950">
    <div class="flex flex-col items-center gap-6">
      <div class="text-center">
        <h1 class="text-2xl font-bold mb-3">Hallo!</h1>
        <button onclick={login} class="bg-primary-300-700 text-primary-contrast-300-700 px-4 py-2 rounded-lg shadow-lg shadow-primary-300-700/50 font-semibold">
          Login mit {env.PUBLIC_GNAGHOME_OAUTH_PROVIDER_ID || "Gnagplus"}</button>
      </div>
    </div>
  </div>
</div>