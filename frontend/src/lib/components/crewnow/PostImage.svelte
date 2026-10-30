<script lang="ts">
    type Props = {
        backImageUrl: string;
        frontImageUrl: string;
        caption?: string | null;
        alt?: string;
        class?: string;
    };

    let {
        backImageUrl,
        frontImageUrl,
        caption = null,
        alt = 'CrewNow-Foto',
        class: className,
    }: Props = $props();

    let mainImage = $state('');
    let overlayImage = $state('');
    let overlayHidden = $state(false);
    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    let swapped = $state(false);

    $effect(() => {
        if (swapped) {
            mainImage = frontImageUrl;
            overlayImage = backImageUrl;
        } else {
            mainImage = backImageUrl;
            overlayImage = frontImageUrl;
        }
    });

    function startHold() {
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => overlayHidden = true, 600);
    }

    function endHold() {
        clearTimeout(pressTimer);
        pressTimer = undefined;
        overlayHidden = false;
    }

    function swapImages() {
        swapped = !swapped;
    }
</script>

<figure class={['w-full pb-4', className]}>
    <div class="relative min-h-72 aspect-[4/3] overflow-hidden rounded-xl bg-surface-200-800">
        <img
            src={mainImage}
            alt={alt}
            class="absolute inset-0 block h-full w-full object-contain"
            onpointerdown={startHold}
            onpointerup={endHold}
            onpointerleave={endHold}
            onpointercancel={endHold}
            oncontextmenu={(event) => event.preventDefault()}
        />
        {#if overlayImage}
            <button
                type="button"
                class="absolute right-3 top-3 aspect-[4/3] w-[27%] overflow-hidden rounded-xl border-2 border-surface-50-950 shadow-lg transition-opacity"
                class:opacity-0={overlayHidden}
                class:pointer-events-none={overlayHidden}
                aria-label="Vorder- und Rückkamera-Bilder vertauschen"
                onclick={swapImages}
            >
                <img src={overlayImage} alt="Vorderkamera-Aufnahme" class="absolute inset-0 block h-full w-full object-contain" />
            </button>
        {/if}
    </div>
    {#if caption}
        <figcaption class="mt-3 px-4 text-md font-semibold leading-relaxed whitespace-pre-wrap break-words text-surface-800-200">{caption}</figcaption>
    {/if}
</figure>