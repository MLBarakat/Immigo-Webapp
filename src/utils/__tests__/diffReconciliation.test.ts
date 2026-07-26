import { describe, it, expect } from 'vitest';
import { reconcileTranscripts, alignTokenSequences } from '../diffReconciliation';

describe('DP Alignment Matrix Validation: diffReconciliation Utilities', () => {
  
  it('should cleanly generate blank patch matrices when handling empty token sequences', () => {
    const historicalCommitted = '';
    const incomingSpeculative = '';

    const reconciliationOutput = reconcileTranscripts(historicalCommitted, incomingSpeculative);

    // Verify system returns a clean baseline configuration when input sequences are blank
    expect(reconciliationOutput.authoritativeText).toBe('');
    expect(reconciliationOutput.patches).toEqual([]);
  });

  it('should accurately process straightforward word insertions and map clean append sequences', () => {
    const historicalCommitted = 'Hello world';
    const incomingSpeculative = 'Hello world this is a test';

    const reconciliationOutput = reconcileTranscripts(historicalCommitted, incomingSpeculative);

    expect(reconciliationOutput.authoritativeText).toBe('Hello world this is a test');
    
    // Validate that the differential engine cleanly locates the newly injected text slice
    expect(reconciliationOutput.patches.length).toBeGreaterThan(0);
    
    const insertPatch = reconciliationOutput.patches.find(p => p.operation === 'INSERT');
    expect(insertPatch).toEqual(
      expect.objectContaining({
        operation: 'INSERT',
        text: 'this',
      })
    );
  });

  it('should handle complex mid-sentence word replacements without throwing index array exceptions', () => {
    // Split sequences explicitly into tokens to test low-level matrix alignment paths
    const originalSequence = ['The', 'quick', 'brown', 'fox'];
    const mutatedSequence  = ['The', 'swift', 'brown', 'fox'];

    const alignmentMatrixPatches = alignTokenSequences(originalSequence, mutatedSequence);

    // Validate that the dynamic program correctly recognizes single word modifications as replacements
    expect(alignmentMatrixPatches).toContainEqual(
      expect.objectContaining({
        operation: 'REPLACE',
        text: 'swift',
        index: 1
      })
    );

    // Confirm that unmodified segments are preserved as stable operational tokens
    expect(alignmentMatrixPatches).toContainEqual(
      expect.objectContaining({
        operation: 'EQUAL',
        text: 'The',
        index: 0
      })
    );
  });

  it('should resolve front-loaded deletions cleanly when historical values drop out of sequence arrays', () => {
    const originalSequence = ['Automated', 'speech', 'processing'];
    const mutatedSequence  = ['speech', 'processing'];

    const alignmentMatrixPatches = alignTokenSequences(originalSequence, mutatedSequence);

    // Verify that front-loaded structural drops are captured correctly as structural deletes
    expect(alignmentMatrixPatches[0]).toEqual(
      expect.objectContaining({
        operation: 'DELETE',
        text: 'Automated',
        index: 0,
      })
    );
  });
});