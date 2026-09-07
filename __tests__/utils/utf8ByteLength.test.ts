import {utf8ByteLength} from 'app/utils/utf8ByteLength';

describe('native UTF-8 request limits', () => {
  it.each([
    '',
    'ASCII',
    'שלום',
    'مرحبا',
    'emoji 🥗 😀',
    '\ud800',
    '\udc00',
    '\ud800a',
    'a\ud800\udc00z',
  ])('matches UTF-8 encoding for %j', value => {
    expect(utf8ByteLength(value)).toBe(Buffer.byteLength(value, 'utf8'));
  });
});
