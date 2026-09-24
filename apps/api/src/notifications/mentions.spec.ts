import { mentionedHandles } from '@nook/contracts';
import { describe, expect, it } from 'vitest';

describe('mention parsing', () => {
  it('finds handles at the start, mid-sentence and before punctuation, once each, lowercased', () => {
    expect(mentionedHandles('@mara see this, @Theo! and @mara again')).toEqual(['mara', 'theo']);
    expect(mentionedHandles('thanks @priya_r.')).toEqual(['priya_r']);
    expect(mentionedHandles('(@sam)')).toEqual(['sam']);
  });

  it('ignores email addresses, double @ and handles that are too short or run into other characters', () => {
    expect(mentionedHandles('mail mara@nook.demo')).toEqual([]);
    expect(mentionedHandles('@@mara')).toEqual([]);
    expect(mentionedHandles('@a is too short')).toEqual([]);
    expect(mentionedHandles('@' + 'x'.repeat(25))).toEqual([]);
  });

  it('ignores mentions inside code spans and code blocks', () => {
    expect(mentionedHandles('run `npm i @types/node` then ping @dev')).toEqual(['dev']);
    expect(mentionedHandles('```\n@decorator\nclass A {}\n``` cc @lena')).toEqual(['lena']);
  });
});
