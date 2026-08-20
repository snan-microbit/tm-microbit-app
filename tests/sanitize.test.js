import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, isDataImageUrl, isValidImageSample, isValidPoseSample, isValidSpectrogram } from '../js/sanitize.js';

describe('escapeHtml', () => {

    it('escapes double quotes (attribute context)', () => {
        assert.equal(escapeHtml('a"b'), 'a&quot;b');
    });

    it('escapes single quotes (attribute context)', () => {
        assert.equal(escapeHtml("a'b"), 'a&#39;b');
    });

    it('escapes < > & (text context)', () => {
        assert.equal(escapeHtml('<img src=x> & <b>'), '&lt;img src=x&gt; &amp; &lt;b&gt;');
    });

    it('neutralizes the attribute-breakout payload from the security audit', () => {
        const payload = '" style="position:fixed;inset:0" x="';
        const escaped = escapeHtml(payload);
        assert.ok(!escaped.includes('"'));
        assert.equal(escaped, '&quot; style=&quot;position:fixed;inset:0&quot; x=&quot;');
    });

    it('does not double-escape: & is escaped once even in entity-like input', () => {
        assert.equal(escapeHtml('&lt;'), '&amp;lt;');
        assert.equal(escapeHtml('&quot;'), '&amp;quot;');
    });

    it('leaves text without special characters untouched (accents, ñ)', () => {
        assert.equal(escapeHtml('Señal fuerte 123 ¡épico!'), 'Señal fuerte 123 ¡épico!');
    });

    it('returns empty string for null and undefined', () => {
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
    });

    it('stringifies non-string values (numeric ids)', () => {
        assert.equal(escapeHtml(1722400000000), '1722400000000');
    });
});

describe('isDataImageUrl', () => {

    it('accepts image data URLs', () => {
        assert.ok(isDataImageUrl('data:image/jpeg;base64,/9j/4AAQ'));
        assert.ok(isDataImageUrl('data:image/png;base64,iVBORw0'));
    });

    it('rejects other schemes and MIME types', () => {
        assert.ok(!isDataImageUrl('javascript:alert(1)'));
        assert.ok(!isDataImageUrl('https://evil.example/x.png'));
        assert.ok(!isDataImageUrl('data:text/html,<script>x</script>'));
    });

    it('rejects image formats the trainers never persist and non-base64 payloads', () => {
        assert.ok(!isDataImageUrl('data:image/svg+xml;utf8,<svg onload=x>'));
        assert.ok(!isDataImageUrl('data:image/webp;base64,AAAA'));
        assert.ok(!isDataImageUrl('data:image/jpeg,notbase64'));
    });

    it('rejects non-string values', () => {
        assert.ok(!isDataImageUrl(null));
        assert.ok(!isDataImageUrl(42));
        assert.ok(!isDataImageUrl({ startsWith: () => true }));
    });
});

describe('isValidImageSample', () => {
    const valid = {
        ci: 0,
        img224: 'data:image/jpeg;base64,AAAA',
        thumb: 'data:image/jpeg;base64,BBBB'
    };

    it('accepts a record with the shape saveSamples() writes', () => {
        assert.ok(isValidImageSample(valid));
    });

    it('rejects thumb or img224 that are not data:image/ URLs', () => {
        assert.ok(!isValidImageSample({ ...valid, thumb: '"><img src=x>' }));
        assert.ok(!isValidImageSample({ ...valid, img224: 'javascript:alert(1)' }));
        assert.ok(!isValidImageSample({ ...valid, thumb: undefined }));
    });

    it('rejects ci that is not a non-negative integer', () => {
        assert.ok(!isValidImageSample({ ...valid, ci: -1 }));
        assert.ok(!isValidImageSample({ ...valid, ci: 1.5 }));
        assert.ok(!isValidImageSample({ ...valid, ci: '0' }));
    });

    it('rejects null, undefined and non-objects', () => {
        assert.ok(!isValidImageSample(null));
        assert.ok(!isValidImageSample(undefined));
        assert.ok(!isValidImageSample('x'));
    });
});

describe('isValidPoseSample', () => {
    const FEATURE_SIZE = 99;
    const valid = {
        ci: 1,
        features: Array(FEATURE_SIZE).fill(0.5),
        thumb: 'data:image/jpeg;base64,CCCC'
    };

    it('accepts a record with the shape saveSamples() writes', () => {
        assert.ok(isValidPoseSample(valid, FEATURE_SIZE));
    });

    it('rejects features with the wrong length', () => {
        assert.ok(!isValidPoseSample({ ...valid, features: Array(98).fill(0.5) }, FEATURE_SIZE));
        assert.ok(!isValidPoseSample({ ...valid, features: [] }, FEATURE_SIZE));
    });

    it('rejects features with non-finite or non-numeric values', () => {
        const withNaN = Array(FEATURE_SIZE).fill(0.5);
        withNaN[3] = NaN;
        assert.ok(!isValidPoseSample({ ...valid, features: withNaN }, FEATURE_SIZE));
        const withString = Array(FEATURE_SIZE).fill(0.5);
        withString[0] = 'x';
        assert.ok(!isValidPoseSample({ ...valid, features: withString }, FEATURE_SIZE));
    });

    it('rejects sparse arrays (holes are skipped by .every but become NaN)', () => {
        const sparse = Array(FEATURE_SIZE);
        sparse[0] = 0.5;
        assert.ok(!isValidPoseSample({ ...valid, features: sparse }, FEATURE_SIZE));
        assert.ok(!isValidPoseSample({ ...valid, features: Array(FEATURE_SIZE) }, FEATURE_SIZE));
    });

    it('rejects non-array features and invalid thumbs', () => {
        assert.ok(!isValidPoseSample({ ...valid, features: 'no-array' }, FEATURE_SIZE));
        assert.ok(!isValidPoseSample({ ...valid, thumb: 'https://evil.example/t.png' }, FEATURE_SIZE));
    });
});

describe('isValidSpectrogram', () => {

    // Shape the speech-commands library produces: frameSize bins per frame,
    // data holding whole frames back to back.
    const FRAME_SIZE = 232;
    const valid = {
        data: new Float32Array(FRAME_SIZE * 43),
        frameSize: FRAME_SIZE
    };

    it('accepts a spectrogram whose length is a whole number of frames', () => {
        assert.ok(isValidSpectrogram(valid));
    });

    it('accepts a plain Array payload (hand-written IndexedDB record)', () => {
        assert.ok(isValidSpectrogram({ data: [1, 2, 3, 4], frameSize: 2 }));
    });

    it('rejects a frameSize that would make the canvas invalid', () => {
        assert.ok(!isValidSpectrogram({ ...valid, frameSize: 0 }));
        assert.ok(!isValidSpectrogram({ ...valid, frameSize: -232 }));
        assert.ok(!isValidSpectrogram({ ...valid, frameSize: 1.5 }));
        assert.ok(!isValidSpectrogram({ ...valid, frameSize: '232' }));
    });

    it('rejects a length that is not a whole number of frames', () => {
        // numFrames would be fractional and createImageData would throw.
        assert.ok(!isValidSpectrogram({ data: new Float32Array(233), frameSize: FRAME_SIZE }));
    });

    it('rejects empty data', () => {
        assert.ok(!isValidSpectrogram({ data: new Float32Array(0), frameSize: FRAME_SIZE }));
    });

    it('rejects payloads that are not numeric sequences', () => {
        assert.ok(!isValidSpectrogram({ data: 'AAAA', frameSize: 2 }));
        assert.ok(!isValidSpectrogram({ data: { length: 4 }, frameSize: 2 }));
        assert.ok(!isValidSpectrogram({ frameSize: 2 }));
    });

    it('rejects null, undefined and a missing spectrogram', () => {
        assert.ok(!isValidSpectrogram(null));
        assert.ok(!isValidSpectrogram(undefined));
    });
});
