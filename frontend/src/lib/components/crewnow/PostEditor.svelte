<script lang="ts">
import { onDestroy, tick } from 'svelte';
    import { api } from '$lib/api';
    import Button from '$lib/components/Button.svelte';
    import PersonTagPicker from './PersonTagPicker.svelte';

    type Person = { id: string; name: string; image: string | null };
    type Props = {
        mode: 'create' | 'edit';
        postId?: string;
        backImageUrl?: string;
        frontImageUrl?: string;
        initialCaption?: string | null;
        initialTaggedUsers?: Person[];
        onSaved: (postId: string) => void;
    };
    type CameraFacing = 'environment' | 'user';

    let {
        mode,
        postId,
        backImageUrl = '',
        frontImageUrl = '',
        initialCaption = null,
        initialTaggedUsers = [],
        onSaved,
    }: Props = $props();

    let currentStep = $state<'inactive' | 'preview' | 'captured'>('inactive');
    let cameraFacing = $state<CameraFacing>('environment');
    let isCapturing = $state(false);
    let isSwitchingCamera = $state(false);
    let isSubmitting = $state(false);
    let errorMessage = $state<string | null>(null);
    let caption = $state('');
    let taggedUserIds = $state<string[]>([]);
    let cameraStream: MediaStream | null = null;
    let videoElement: HTMLVideoElement | undefined = $state();
    let createPostId = $state('');
    let firstCaptureFacing = $state<CameraFacing | null>(null);

    let backPreviewUrl = $state('');
    let frontPreviewUrl = $state('');
    let backBlob = $state<Blob | null>(null);
    let frontBlob = $state<Blob | null>(null);
    let backUploadId = $state<string | null>(null);
    let frontUploadId = $state<string | null>(null);
    let backUploadPromise: Promise<string> | null = null;
    let frontUploadPromise: Promise<string> | null = null;
    let backUploadAttempt = 0;
    let frontUploadAttempt = 0;
    let uploadStatus = $state<'idle' | 'uploading' | 'ready' | 'failed'>('idle');
    let captureRun = 0;
    let cameraRun = 0;
    let frameWaitTimeout: ReturnType<typeof setTimeout> | undefined;
    let cancelFrameWait: (() => void) | null = null;
    let isShowingBack = $state(true);

    const primaryPhoto = $derived(isShowingBack ? backPreviewUrl : frontPreviewUrl);
    const smallPhoto = $derived(isShowingBack ? frontPreviewUrl : backPreviewUrl);

    function stopCamera() {
        cameraRun++;
        cancelFrameWait?.();
        cameraStream?.getTracks().forEach((track) => track.stop());
        cameraStream = null;
        if (videoElement) videoElement.srcObject = null;
    }

    async function startCamera(facing: CameraFacing) {
        stopCamera();
        const activeRun = ++cameraRun;
        errorMessage = null;
        if (!navigator.mediaDevices?.getUserMedia) {
            errorMessage = 'Dieser Browser unterstützt keine Kamera.';
            return;
        }
        currentStep = 'preview';
        await tick();
        try {
            const stream = await getCameraStream(facing, () => activeRun === cameraRun);
            if (activeRun !== cameraRun) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            cameraStream = stream;
            cameraFacing = facing;
            if (!videoElement) throw new Error('Kameravorschau ist nicht verfügbar.');
            videoElement.srcObject = cameraStream;
            await videoElement.play();
            await waitForVideoFrame(videoElement);
            if (activeRun !== cameraRun) return;
        } catch {
            if (activeRun !== cameraRun) return;
            stopCamera();
            errorMessage = 'Die Kamera konnte nicht gestartet werden. Bitte erlaube den Zugriff oder wähle eine andere Kamera.';
            currentStep = 'inactive';
        }
    }

    async function getCameraStream(facing: CameraFacing, isCurrentRun: () => boolean): Promise<MediaStream> {
        const base: MediaTrackConstraints = { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } };
        let exactDevice: string | null = null;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cameras = devices.filter((device) => device.kind === 'videoinput' && device.label);
            const keywords = facing === 'user'
                ? ['front', 'user', 'selfie', 'vorder']
                : ['back', 'environment', 'rear', 'rück'];
            const matching = cameras.find((device) => {
                const label = device.label.toLowerCase();
                return keywords.some((keyword) => label.includes(keyword))
                    && !['ultra', 'dual'].some((excluded) => label.includes(excluded));
            });
            exactDevice = matching?.deviceId || null;
        } catch {
            // Enumeration is optional: use facingMode on browsers that hide camera labels.
        }

        if (!isCurrentRun()) throw new Error('Kamerawechsel wurde abgebrochen.');
        const attempts: MediaTrackConstraints[] = [
            ...(exactDevice ? [{ ...base, deviceId: { exact: exactDevice } }] : []),
            base,
            { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 } },
            { facingMode: { ideal: facing } },
        ];
        let lastError: unknown;
        let supportedConstraints: MediaTrackSupportedConstraints | undefined;
        try {
            supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
        } catch {
            supportedConstraints = undefined;
        }
        for (const video of attempts) {
            if (!isCurrentRun()) throw new Error('Kamerawechsel wurde abgebrochen.');
            try {
                const adjusted = { ...video };
                if (supportedConstraints && !supportedConstraints.facingMode) delete adjusted.facingMode;
                if (supportedConstraints && !supportedConstraints.deviceId) delete adjusted.deviceId;
                if (supportedConstraints && !supportedConstraints.width) delete adjusted.width;
                if (supportedConstraints && !supportedConstraints.height) delete adjusted.height;
                return await navigator.mediaDevices.getUserMedia({ video: adjusted, audio: false });
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError instanceof Error ? lastError : new Error('Kamera konnte nicht geöffnet werden.');
    }

    async function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) return;
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(frameWaitTimeout);
                frameWaitTimeout = undefined;
                video.removeEventListener('loadeddata', onReady);
                video.removeEventListener('canplay', onReady);
                video.removeEventListener('error', onError);
            };
            const onReady = () => {
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    cleanup();
                    resolve();
                }
            };
            const onError = () => {
                cleanup();
                reject(new Error('Der Videostream konnte nicht gelesen werden.'));
            };
            cancelFrameWait = () => {
                cleanup();
                reject(new Error('Der Kamerastream wurde beendet.'));
            };
            video.addEventListener('loadeddata', onReady);
            video.addEventListener('canplay', onReady);
            video.addEventListener('error', onError, { once: true });
            frameWaitTimeout = setTimeout(() => {
                cleanup();
                reject(new Error('Die Kamera hat innerhalb weniger Sekunden kein Bild geliefert.'));
            }, 8000);
            onReady();
        });
        // WebKit can report loadeddata before a decoded frame is drawable; wait for one frame callback when available.
        if ('requestVideoFrameCallback' in video) {
            await new Promise<void>((resolve) => {
                let callbackId = 0;
                const timeout = setTimeout(() => {
                    if (callbackId && 'cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(callbackId);
                    resolve();
                }, 1500);
                callbackId = video.requestVideoFrameCallback(() => {
                    clearTimeout(timeout);
                    resolve();
                });
                const abortOnStreamStop = () => {
                    clearTimeout(timeout);
                    if (callbackId && 'cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(callbackId);
                    resolve();
                };
                cancelFrameWait = abortOnStreamStop;
            });
        } else {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
    }

    function setPreviewUrls(backUrl: string, frontUrl: string) {
        if (backPreviewUrl.startsWith('blob:') && backPreviewUrl !== backUrl) URL.revokeObjectURL(backPreviewUrl);
        if (frontPreviewUrl.startsWith('blob:') && frontPreviewUrl !== frontUrl) URL.revokeObjectURL(frontPreviewUrl);
        backPreviewUrl = backUrl;
        frontPreviewUrl = frontUrl;
    }

    function takePhoto(): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const video = videoElement;
            if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
                reject(new Error('Die Kamera ist noch nicht bereit.'));
                return;
            }
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if (!context) {
                reject(new Error('Das Foto konnte nicht aufgenommen werden.'));
                return;
            }
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Das Foto konnte nicht gespeichert werden.')), 'image/jpeg', 0.9);
        });
    }
    async function captureBoth() {
        const run = ++captureRun;
        isCapturing = true;
        errorMessage = null;
        try {
            const firstFacing = cameraFacing;
            const first = await takePhoto();
            if (run !== captureRun) return;

            firstCaptureFacing = firstFacing;
            const firstPreviewUrl = URL.createObjectURL(first);
            setPreviewUrls(
                firstFacing === 'environment' ? firstPreviewUrl : '',
                firstFacing === 'user' ? firstPreviewUrl : '',
            );

            await startCamera(firstFacing === 'environment' ? 'user' : 'environment');
            if (run !== captureRun) return;
            if (currentStep !== 'preview') throw new Error(errorMessage ?? 'Die zweite Kamera konnte nicht gestartet werden.');

            // Give camera switching a full second: iOS Safari can settle facing-mode changes late.
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (!videoElement) throw new Error('Kameravorschau ist nicht verfügbar.');
            await waitForVideoFrame(videoElement);
            if (run !== captureRun) return;

            const second = await takePhoto();
            if (run !== captureRun) return;

            if (firstFacing === 'environment') {
                backBlob = first;
                frontBlob = second;
                setPreviewUrls(backPreviewUrl, URL.createObjectURL(second));
            } else {
                frontBlob = first;
                backBlob = second;
                setPreviewUrls(URL.createObjectURL(second), frontPreviewUrl);
            }
            isShowingBack = true;
            currentStep = 'captured';
            firstCaptureFacing = null;
            stopCamera();
            beginEarlyUploads(run);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Die Bilder konnten nicht aufgenommen werden.';
            stopCamera();
            firstCaptureFacing = null;
            setPreviewUrls('', '');
            currentStep = 'inactive';
        } finally {
            isCapturing = false;
        }
    }

    function beginEarlyUploads(run: number) {
        if (!backBlob || !frontBlob) return;
        uploadStatus = 'uploading';
        const backAttempt = ++backUploadAttempt;
        const frontAttempt = ++frontUploadAttempt;
        backUploadPromise = uploadImage(backBlob).then((id) => {
            if (run !== captureRun || backAttempt !== backUploadAttempt) {
                void discardUpload(id);
                throw new Error('Die Aufnahme wurde ersetzt.');
            }
            backUploadId = id;
            return id;
        });
        frontUploadPromise = uploadImage(frontBlob).then((id) => {
            if (run !== captureRun || frontAttempt !== frontUploadAttempt) {
                void discardUpload(id);
                throw new Error('Die Aufnahme wurde ersetzt.');
            }
            frontUploadId = id;
            return id;
        });
        void Promise.allSettled([backUploadPromise, frontUploadPromise]).then((results) => {
            if (run === captureRun && results.some((result) => result.status === 'rejected')) {
                uploadStatus = 'failed';
                errorMessage = 'Ein Bild konnte noch nicht hochgeladen werden. Beim Veröffentlichen versuchen wir es erneut.';
            } else if (run === captureRun) {
                uploadStatus = 'ready';
            }
        });
    }

    async function discardUpload(fileId: string) {
        try {
            await api.crewnow.uploads({ id: fileId }).delete();
        } catch {
            // Pending uploads also have the Files service's normal expiry cleanup as a fallback.
        }
    }

    async function discardCurrentUploads() {
        backUploadAttempt++;
        frontUploadAttempt++;
        const ids = [backUploadId, frontUploadId].filter((id): id is string => id !== null);
        backUploadId = null;
        frontUploadId = null;
        backUploadPromise = null;
        frontUploadPromise = null;
        uploadStatus = 'idle';
        await Promise.all(ids.map(discardUpload));
    }

    async function switchCamera() {
        if (isSwitchingCamera || isCapturing || firstCaptureFacing !== null) return;
        isSwitchingCamera = true;
        try {
            await startCamera(cameraFacing === 'environment' ? 'user' : 'environment');
        } finally {
            isSwitchingCamera = false;
        }
    }

    async function uploadImage(blob: Blob): Promise<string> {
        const response = await api.files.post({
            file: new File([blob], 'crewnow.jpg', { type: 'image/jpeg' }),
        });
        if (response.error || !response.data) throw new Error('Ein Bild konnte nicht hochgeladen werden. Bitte versuche es erneut.');
        return response.data.id;
    }

    async function uploadOrReuse(image: 'back' | 'front', blob: Blob): Promise<string> {
        const existingId = image === 'back' ? backUploadId : frontUploadId;
        if (existingId) return existingId;
        let promise = image === 'back' ? backUploadPromise : frontUploadPromise;
        if (promise) {
            try {
                return await promise;
            } catch {
                if (image === 'back') backUploadPromise = null;
                else frontUploadPromise = null;
            }
        }
        const attempt = image === 'back' ? ++backUploadAttempt : ++frontUploadAttempt;
        const upload = uploadImage(blob).then((id) => {
            if ((image === 'back' && backUploadAttempt !== attempt) || (image === 'front' && frontUploadAttempt !== attempt)) {
                void discardUpload(id);
                throw new Error('Die Aufnahme wurde ersetzt.');
            }
            if (image === 'back') backUploadId = id;
            else frontUploadId = id;
            return id;
        });
        if (image === 'back') backUploadPromise = upload;
        else frontUploadPromise = upload;
        return upload;
    }

    async function submitPost(event: SubmitEvent) {
        event.preventDefault();
        isSubmitting = true;
        errorMessage = null;
        try {
            if (mode === 'edit') {
                if (!postId) throw new Error('Der Post wurde nicht gefunden.');
                const response = await api.crewnow.posts({ id: postId }).patch({ caption: caption.trim() || null, taggedUserIds });
                if (response.error) throw new Error('Der Post konnte nicht gespeichert werden.');
                onSaved(postId);
                return;
            }
            if (!backBlob || !frontBlob) throw new Error('Nimm zuerst beide Bilder auf.');
            const [backImageFileId, frontImageFileId] = await Promise.all([
                uploadOrReuse('back', backBlob),
                uploadOrReuse('front', frontBlob),
            ]);
            createPostId ||= crypto.randomUUID();
            const response = await api.crewnow.posts.post({
                id: createPostId,
                backImageFileId,
                frontImageFileId,
                caption: caption.trim() || null,
                taggedUserIds,
            });
            if (response.error) throw new Error('Der Post konnte nicht veröffentlicht werden. Bitte versuche es erneut.');
            if (!response.data) throw new Error('Der Post konnte nicht veröffentlicht werden. Bitte versuche es erneut.');
            backUploadId = null;
            frontUploadId = null;
            onSaved(response.data.id);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
        } finally {
            isSubmitting = false;
        }
    }

    function retake() {
        if (isSubmitting) return;
        captureRun++;
        void discardCurrentUploads();
        setPreviewUrls('', '');
        backBlob = null;
        frontBlob = null;
        uploadStatus = 'idle';
        caption = '';
        taggedUserIds = [];
        void startCamera('environment');
    }

    $effect(() => {
        if (mode === 'edit') {
            caption = initialCaption ?? '';
            taggedUserIds = initialTaggedUsers.map((person) => person.id);
            backPreviewUrl = backImageUrl;
            frontPreviewUrl = frontImageUrl;
        } else {
            caption = '';
            taggedUserIds = [];
        }
    });

    onDestroy(() => {
        captureRun++;
        setPreviewUrls('', '');
        stopCamera();
        if (mode === 'create') void discardCurrentUploads();
    });
    </script>

<form onsubmit={submitPost} class="mx-auto flex w-full max-w-2xl flex-col gap-6">
    {#if mode === 'create'}
        {#if currentStep === 'inactive'}
            <section class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900 p-6 text-center">
                <h2 class="text-xl font-semibold text-surface-950-50">Ein neues CrewNow aufnehmen</h2>
                <p class="mt-2 text-sm text-surface-600-400">Wir nehmen ein Bild mit der Rückkamera und eines mit der Frontkamera auf.</p>
                <Button type="button" class="mt-5" onclick={() => void startCamera('environment')}>Kamera aktivieren</Button>
            </section>
        {:else if currentStep === 'preview'}
            <section class="space-y-4 rounded-2xl border border-surface-300-700/40 bg-surface-100-900 p-4">
                <div class="relative mx-auto w-full aspect-[3/4] overflow-hidden rounded-xl bg-surface-950">
                    {#if firstCaptureFacing === 'environment'}
                        <img src={backPreviewUrl} alt="Rückkamera-Aufnahme" class="absolute inset-0 block h-full w-full object-cover" />
                        <div class="absolute right-3 top-3 aspect-[3/4] w-[27%] overflow-hidden rounded-xl border-2 border-surface-50-950 shadow-lg">
                            <video bind:this={videoElement} class="absolute inset-0 block h-full w-full object-cover" autoplay playsinline muted aria-label="Live-Kamerabild der Frontkamera"></video>
                        </div>
                    {:else if firstCaptureFacing === 'user'}
                        <video bind:this={videoElement} class="absolute inset-0 block h-full w-full object-cover" autoplay playsinline muted aria-label="Live-Kamerabild der Rückkamera"></video>
                        <div class="absolute right-3 top-3 aspect-[3/4] w-[27%] overflow-hidden rounded-xl border-2 border-surface-50-950 shadow-lg">
                            <img src={frontPreviewUrl} alt="Frontkamera-Aufnahme" class="absolute inset-0 block h-full w-full object-cover" />
                        </div>
                    {:else}
                        <video bind:this={videoElement} class="absolute inset-0 block h-full w-full object-cover" autoplay playsinline muted aria-label="Live-Kamerabild"></video>
                    {/if}
                </div>
                <div class="flex justify-center gap-3">
                    <Button type="button" variant="outlined" onclick={() => void switchCamera()} disabled={isCapturing || isSwitchingCamera}>{isSwitchingCamera ? 'Kamera wird gewechselt …' : 'Kamera wechseln'}</Button>
                    <Button type="button" onclick={() => void captureBoth()} disabled={isCapturing}>{isCapturing ? 'Aufnahme läuft …' : 'Aufnehmen'}</Button>
                </div>
                {#if isCapturing}<p class="text-center text-sm text-surface-600-400" role="status">Das zweite Bild wird aufgenommen …</p>{/if}
            </section>
        {:else}
            <section class="space-y-6 rounded-2xl border border-surface-300-700/40 bg-surface-100-900 p-4">
                <h2 class="text-lg font-semibold text-surface-950-50">Vorschau</h2>
                <div class="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-surface-950">
                    <img src={primaryPhoto} alt={isShowingBack ? 'Rückkamera-Aufnahme' : 'Frontkamera-Aufnahme'} class="absolute inset-0 block h-full w-full object-cover" />
                    <button type="button" class="absolute right-3 top-3 aspect-[3/4] w-[27%] overflow-hidden rounded-xl border-2 border-surface-50-950 shadow-lg" aria-label="Vorder- und Rückkamera-Bilder vertauschen" onclick={() => isShowingBack = !isShowingBack}>
                        <img src={smallPhoto} alt={isShowingBack ? 'Frontkamera-Aufnahme' : 'Rückkamera-Aufnahme'} class="absolute inset-0 block h-full w-full object-cover" />
                    </button>
                </div>
                <div class="flex justify-center">
                    <Button type="button" variant="outlined" onclick={retake} disabled={isSubmitting}>Neu aufnehmen</Button>
                </div>
                <div class="space-y-3">
                    <h3 id="caption-heading" class="font-semibold text-surface-950-50">Bildunterschrift <span class="font-normal text-surface-600-400">(optional)</span></h3>
                    <textarea aria-labelledby="caption-heading" bind:value={caption} maxlength="500" rows="3" placeholder="Was möchtest du zu diesem Bild erzählen?" class="textarea w-full resize-y"></textarea>
                    <span class="block text-right text-xs text-surface-600-400">{caption.length}/500</span>
                </div>
                <PersonTagPicker selectedIds={taggedUserIds} initialSelectedUsers={initialTaggedUsers} onChange={(ids) => taggedUserIds = ids} />
            </section>
        {/if}
    {:else}
        <section class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900 p-4">
            <h2 class="mb-4 text-lg font-semibold text-surface-950-50">Bilder</h2>
            <div class="grid gap-4 sm:grid-cols-2">
                <div><p class="mb-2 text-sm font-medium text-surface-700-300">Rückkamera</p><img src={backPreviewUrl} alt="Rückkamera-Aufnahme des Posts" class="w-full rounded-xl object-contain" /></div>
                <div><p class="mb-2 text-sm font-medium text-surface-700-300">Frontkamera</p><img src={frontPreviewUrl} alt="Frontkamera-Aufnahme des Posts" class="w-full rounded-xl object-contain" /></div>
            </div>
            <p class="mt-3 text-sm text-surface-600-400">Die Bilder können nach dem Veröffentlichen nicht geändert werden.</p>
            <div class="mt-6 space-y-6">
                <div class="space-y-3">
                    <h3 id="caption-heading" class="font-semibold text-surface-950-50">Bildunterschrift <span class="font-normal text-surface-600-400">(optional)</span></h3>
                    <textarea aria-labelledby="caption-heading" bind:value={caption} maxlength="500" rows="3" placeholder="Was möchtest du zu diesem Bild erzählen?" class="textarea w-full resize-y"></textarea>
                    <span class="block text-right text-xs text-surface-600-400">{caption.length}/500</span>
                </div>
                <PersonTagPicker selectedIds={taggedUserIds} initialSelectedUsers={initialTaggedUsers} onChange={(ids) => taggedUserIds = ids} />
            </div>
        </section>
    {/if}

    {#if errorMessage}<p class="rounded-lg bg-error-100-900 p-3 text-sm text-error-800-200" role="alert">{errorMessage}</p>{/if}

    {#if mode === 'create' && currentStep === 'captured'}
        <p class="text-right text-sm text-surface-600-400" role="status">
            {uploadStatus === 'uploading' ? 'Bilder werden bereits hochgeladen …' : uploadStatus === 'ready' ? 'Bilder bereit zum Veröffentlichen.' : uploadStatus === 'failed' ? 'Upload wird beim Veröffentlichen erneut versucht.' : ''}
        </p>
    {/if}

    {#if mode === 'edit' || currentStep === 'captured'}
        <div class="flex flex-wrap justify-end gap-3">
            <a href={mode === 'edit' && postId ? `/crewnow/posts/${encodeURIComponent(postId)}` : '/crewnow'} class="btn preset-outlined">Abbrechen</a>
            <Button type="submit" disabled={isSubmitting || (mode === 'create' && (!backBlob || !frontBlob))}>
                {isSubmitting ? 'Wird veröffentlicht …' : mode === 'create' ? 'CrewNow veröffentlichen' : 'Änderungen speichern'}
            </Button>
        </div>
    {/if}
</form>