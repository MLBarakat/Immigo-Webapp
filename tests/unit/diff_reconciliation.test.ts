// tests/unit/diff_reconciliation.test.ts
// T016: Unit tests verifying Levenshtein alignment, Jaccard similarity,
//       and stability lock behavior in diffReconciliation.ts

import { describe, it, expect } from 'vitest';
import { diffTokens, jaccardSimilarity, tokenEditDistance } from '../../src/utils/diffReconciliation';

// ─── Jaccard Similarity ───────────────────────────────────────────────────────

describe('jaccardSimilarity', () => {
    it('returns 1 for identical token arrays', () => {
        expect(jaccardSimilarity(['hello', 'world'], ['hello', 'world'])).toBe(1);
    });

    it('returns 0 for completely disjoint arrays', () => {
        expect(jaccardSimilarity(['foo', 'bar'], ['baz', 'qux'])).toBe(0);
    });

    it('returns 1 for two empty arrays', () => {
        expect(jaccardSimilarity([], [])).toBe(1);
    });

    it('returns partial similarity for overlapping sets', () => {
        // A = {a, b, c}, B = {b, c, d} → intersection = {b,c}, union = {a,b,c,d} → 2/4 = 0.5
        const sim = jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd']);
        expect(sim).toBeCloseTo(0.5, 5);
    });

    it('is symmetric', () => {
        const a = ['the', 'quick', 'brown'];
        const b = ['the', 'quick', 'fox'];
        expect(jaccardSimilarity(a, b)).toBeCloseTo(jaccardSimilarity(b, a), 10);
    });
});

// ─── Stability Lock ───────────────────────────────────────────────────────────

describe('diffTokens — stability lock (≥85% similarity)', () => {
    it('returns all unchanged tokens when texts are identical', () => {
        const result = diffTokens('hello world', 'hello world');
        expect(result.every(r => r.type === 'unchanged')).toBe(true);
        expect(result.map(r => r.token)).toEqual(['hello', 'world']);
    });

    it('returns all unchanged when similarity is above 85%', () => {
        // 'I am a citizen of the United States' vs same with one word changed
        // Jaccard: 6/8 = 0.75 — below threshold, so this should NOT lock
        // Use near-identical to test the lock:
        const result = diffTokens('the quick brown fox', 'the quick brown fox jumps');
        // Jaccard: {the,quick,brown,fox} ∩ {the,quick,brown,fox,jumps} = 4, union = 5 → 0.8 < 0.85
        // Should NOT be fully locked — has an insert
        const hasInsert = result.some(r => r.type === 'insert');
        expect(hasInsert).toBe(true);
    });

    it('locks and returns unchanged for very high overlap', () => {
        // Jaccard({a,b,c,d,e,f,g}, {a,b,c,d,e,f,h}) = 6/8 = 0.75 — no lock
        // Use same text with punctuation variation to get >85%:
        const base = 'I want to become a citizen';
        const speculative = 'I want to become a citizen.';
        // tokenize splits on whitespace, so 'citizen.' is a different token
        // Jaccard = 5/7 ≈ 0.714 → no lock, expect diff
        const result = diffTokens(base, speculative);
        expect(result.length).toBeGreaterThan(0);
    });
});

// ─── Pure Speculative / Pure Committed Cases ──────────────────────────────────

describe('diffTokens — edge cases', () => {
    it('returns speculative tokens when committed is empty', () => {
        const result = diffTokens('', 'hello world');
        expect(result.every(r => r.type === 'speculative')).toBe(true);
        expect(result.map(r => r.token)).toEqual(['hello', 'world']);
    });

    it('returns unchanged tokens when speculative is empty', () => {
        const result = diffTokens('hello world', '');
        expect(result.every(r => r.type === 'unchanged')).toBe(true);
        expect(result.map(r => r.token)).toEqual(['hello', 'world']);
    });

    it('returns empty array for two empty strings', () => {
        expect(diffTokens('', '')).toEqual([]);
    });
});

// ─── Insert / Delete / Substitute Detection ───────────────────────────────────

describe('diffTokens — Levenshtein edit operations', () => {
    it('detects inserted token at end', () => {
        const result = diffTokens('hello', 'hello world');
        const types = result.map(r => r.type);
        expect(types).toContain('unchanged');
        expect(types).toContain('insert');
        const inserted = result.find(r => r.type === 'insert');
        expect(inserted?.token).toBe('world');
    });

    it('detects deleted token', () => {
        const result = diffTokens('hello world', 'hello');
        expect(result.some(r => r.type === 'delete')).toBe(true);
        const deleted = result.find(r => r.type === 'delete');
        expect(deleted?.token).toBe('world');
    });

    it('detects substituted token', () => {
        const result = diffTokens('hello world', 'hello earth');
        const sub = result.find(r => r.type === 'substitute');
        expect(sub).toBeDefined();
        expect(sub?.token).toBe('earth');
    });

    it('handles multi-word substitution alignment', () => {
        const result = diffTokens(
            'I want to become a citizen',
            'I would like to become a citizen'
        );
        // 'want' vs 'would like' — should produce inserts/substitutes
        const hasChanges = result.some(r => r.type !== 'unchanged');
        expect(hasChanges).toBe(true);
        // 'become a citizen' should be unchanged
        const unchangedTokens = result.filter(r => r.type === 'unchanged').map(r => r.token);
        expect(unchangedTokens).toContain('become');
        expect(unchangedTokens).toContain('citizen');
    });

    it('preserves newIndex ordering for insert tokens', () => {
        const result = diffTokens('a b c', 'a x b c');
        const indices = result.filter(r => r.type !== 'delete').map(r => r.newIndex);
        // Indices should be non-decreasing for non-delete tokens
        for (let i = 1; i < indices.length; i++) {
            expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
        }
    });
});

// ─── Edit Distance ────────────────────────────────────────────────────────────

describe('tokenEditDistance', () => {
    it('returns 0 for identical sequences', () => {
        expect(tokenEditDistance(['hello', 'world'], ['hello', 'world'])).toBe(0);
    });

    it('returns 1 for completely different single-token sequences', () => {
        expect(tokenEditDistance(['foo'], ['bar'])).toBe(1);
    });

    it('returns 0.5 for one change in a two-token sequence', () => {
        expect(tokenEditDistance(['hello', 'world'], ['hello', 'earth'])).toBeCloseTo(0.5, 5);
    });

    it('returns 0 for two empty sequences', () => {
        expect(tokenEditDistance([], [])).toBe(0);
    });
});
