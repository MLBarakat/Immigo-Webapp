import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readDocTombstone, writeDocTombstone, markDocTombstone } from '../docTombstone';

describe('docTombstone', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when no record exists', () => {
    expect(readDocTombstone()).toBeNull();
  });

  it('round-trips a record written at boot', () => {
    writeDocTombstone({ bootId: 'b-1', time: '2026-10-20T21:05:16.303Z', pagehideFired: false });
    expect(readDocTombstone()).toMatchObject({
      bootId: 'b-1',
      time: '2026-10-20T21:05:16.303Z',
      pagehideFired: false,
    });
  });

  it('returns null on corrupt JSON instead of throwing', () => {
    sessionStorage.setItem('immigo_doc_tombstone_v1', '{not-json');
    expect(readDocTombstone()).toBeNull();
  });

  it('returns null when the record is not an object with a bootId', () => {
    sessionStorage.setItem('immigo_doc_tombstone_v1', JSON.stringify({ nope: true }));
    expect(readDocTombstone()).toBeNull();
  });

  it('merges marks into the existing record without dropping fields', () => {
    writeDocTombstone({ bootId: 'b-2', time: 't0', pagehideFired: false });
    markDocTombstone({ submitAt: 't1' });
    markDocTombstone({ inferAt: 't2' });
    const record = readDocTombstone();
    expect(record).toMatchObject({
      bootId: 'b-2',
      pagehideFired: false,
      submitAt: 't1',
      inferAt: 't2',
    });
  });

  it('applies explicit null clears (retry dispatch clears prior response marks)', () => {
    writeDocTombstone({ bootId: 'b-3', time: 't0', pagehideFired: false });
    markDocTombstone({ submitResponseAt: 't1' });
    markDocTombstone({ submitAt: 't2', submitResponseAt: null, submitErrorAt: null });
    const record = readDocTombstone();
    expect(record?.submitAt).toBe('t2');
    expect(record?.submitResponseAt).toBeNull();
    expect(record?.submitErrorAt).toBeNull();
  });

  it('refuses to create a record before boot writes one', () => {
    markDocTombstone({ submitAt: 't-early' });
    expect(sessionStorage.getItem('immigo_doc_tombstone_v1')).toBeNull();
    expect(readDocTombstone()).toBeNull();
  });

  it('never throws when sessionStorage writes fail', () => {
    writeDocTombstone({ bootId: 'b-4', time: 't0', pagehideFired: false });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => markDocTombstone({ submitAt: 't1' })).not.toThrow();
    expect(() => writeDocTombstone({ bootId: 'b-5', time: 't1', pagehideFired: true })).not.toThrow();
  });

  it('never throws when sessionStorage reads fail', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => readDocTombstone()).not.toThrow();
    expect(readDocTombstone()).toBeNull();
    expect(() => markDocTombstone({ submitAt: 't1' })).not.toThrow();
  });
});
