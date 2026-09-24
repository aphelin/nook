import { parseSearch } from '@nook/contracts';
import { describe, expect, it } from 'vitest';

describe('search query parsing', () => {
  it('splits words and filters, lowercased, without duplicates', () => {
    expect(parseSearch('Heel HOOK in:#Beta-Spray from:@Mara heel')).toEqual({
      terms: ['heel', 'hook'],
      excluded: [],
      in: 'beta-spray',
      from: 'mara',
    });
    expect(parseSearch('in:general from:theo')).toMatchObject({ terms: [], in: 'general', from: 'theo' });
  });

  it('turns -word into an exclusion and keeps accented letters', () => {
    expect(parseSearch('crêpes -noodles')).toMatchObject({ terms: ['crêpes'], excluded: ['noodles'] });
  });

  it('drops full-text query syntax so typed text can never become an operator', () => {
    expect(parseSearch(`a & b | !c :* ( ) ' " \\ <-> x:*`).terms).toEqual(['a', 'b', 'c', 'x']);
    expect(parseSearch('!!! ... ???').terms).toEqual([]);
  });
});
