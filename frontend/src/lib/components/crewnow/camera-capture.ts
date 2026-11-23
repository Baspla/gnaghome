export type CropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/** Returns the centered source crop that fills a 3:4 `object-cover` preview. */
export function getCenteredCropRect(sourceWidth: number, sourceHeight: number, zoom = 1): CropRect {
    const targetAspectRatio = 3 / 4;
    const sourceAspectRatio = sourceWidth / sourceHeight;
    const zoomFactor = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;

    if (sourceAspectRatio > targetAspectRatio) {
        const width = (sourceHeight * targetAspectRatio) / zoomFactor;
        const height = sourceHeight / zoomFactor;
        return {
            x: (sourceWidth - width) / 2,
            y: (sourceHeight - height) / 2,
            width,
            height,
        };
    }

    const width = sourceWidth / zoomFactor;
    const height = sourceWidth / targetAspectRatio / zoomFactor;
    return {
        x: (sourceWidth - width) / 2,
        y: (sourceHeight - height) / 2,
        width,
        height,
    };
}