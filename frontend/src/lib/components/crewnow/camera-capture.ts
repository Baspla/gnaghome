export type CropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/** Returns the centered source crop that fills a 3:4 `object-cover` preview. */
export function getCenteredCropRect(sourceWidth: number, sourceHeight: number): CropRect {
    const targetAspectRatio = 3 / 4;
    const sourceAspectRatio = sourceWidth / sourceHeight;

    if (sourceAspectRatio > targetAspectRatio) {
        const width = sourceHeight * targetAspectRatio;
        return {
            x: (sourceWidth - width) / 2,
            y: 0,
            width,
            height: sourceHeight,
        };
    }

    const height = sourceWidth / targetAspectRatio;
    return {
        x: 0,
        y: (sourceHeight - height) / 2,
        width: sourceWidth,
        height,
    };
}