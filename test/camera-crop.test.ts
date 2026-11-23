import { describe, expect, it } from 'bun:test';
import { getCenteredCropRect } from '../frontend/src/lib/components/crewnow/camera-capture';

describe('getCenteredCropRect', () => {
    it('crops landscape camera frames to the centered 3:4 preview', () => {
        expect(getCenteredCropRect(1280, 960)).toEqual({
            x: 280,
            y: 0,
            width: 720,
            height: 960,
        });
    });

    it('crops portrait camera frames vertically to the centered 3:4 preview', () => {
        expect(getCenteredCropRect(720, 1280)).toEqual({
            x: 0,
            y: 160,
            width: 720,
            height: 960,
        });
    });

    it('keeps frames already matching the preview ratio uncropped', () => {
        expect(getCenteredCropRect(720, 960)).toEqual({
            x: 0,
            y: 0,
            width: 720,
            height: 960,
        });
    });

    it('applies centered digital zoom to the preview crop', () => {
        expect(getCenteredCropRect(1280, 960, 2)).toEqual({
            x: 460,
            y: 240,
            width: 360,
            height: 480,
        });
    });
});