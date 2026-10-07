import { describe, expect, it } from 'vitest';
import { ANDROID_IDS } from '../src/core/types';

describe('core contracts', () => {
  it('lists the three androids', () => {
    expect(ANDROID_IDS).toEqual(['wren', 'brick', 'vesper']);
  });
});
