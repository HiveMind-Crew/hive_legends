import { describe, expect, it } from 'vitest';
import { MenuSelection } from '../src/game/menuSelection';

describe('MenuSelection', () => {
  it('moves to list boundaries with wraparound', () => {
    const selection = new MenuSelection([3]);
    expect(selection.move('up')).toEqual({ row: 0, col: 2, index: 2 });
    expect(selection.move('down')).toEqual({ row: 0, col: 0, index: 0 });
    expect(selection.move('right')).toEqual({ row: 0, col: 1, index: 1 });
    expect(selection.move('left')).toEqual({ row: 0, col: 0, index: 0 });
  });

  it('maps vertical movement through ragged rows and wraps rows', () => {
    const selection = new MenuSelection([3, 2, 3], { row: 0, col: 2 });
    expect(selection.move('down')).toEqual({ row: 1, col: 1, index: 4 });
    expect(selection.move('down')).toEqual({ row: 2, col: 2, index: 7 });
    expect(selection.move('down')).toEqual({ row: 0, col: 2, index: 2 });
    expect(selection.move('up')).toEqual({ row: 2, col: 2, index: 7 });
  });

  it('directly selects a pointer target and confirms the same target', () => {
    const selection = new MenuSelection([3, 2, 3]);
    expect(selection.pointer({ row: 1, col: 1 })).toEqual({ row: 1, col: 1, index: 4 });
    expect(selection.confirm()).toEqual({ row: 1, col: 1, index: 4 });
  });

  it('keeps the selected target stable when a render reconciles the rows', () => {
    const selection = new MenuSelection([3, 2, 3], { row: 1, col: 1 });
    selection.setRows([3, 2, 3]);
    expect(selection.target).toEqual({ row: 1, col: 1, index: 4 });
    selection.setRows([3, 2]);
    expect(selection.target).toEqual({ row: 1, col: 1, index: 4 });
    selection.setRows([2]);
    expect(selection.target).toEqual({ row: 0, col: 1, index: 1 });
  });

  it('wraps direct selection inside every row', () => {
    const selection = new MenuSelection([2, 1]);
    expect(selection.select({ row: -1, col: 4 })).toEqual({ row: 1, col: 0, index: 2 });
    expect(selection.selectIndex(-1)).toEqual({ row: 1, col: 0, index: 2 });
  });
});
