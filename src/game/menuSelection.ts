/**
 * A device-neutral cursor for menu lists and ragged grids.
 *
 * The scene owns the rendered targets; this model owns the only selected
 * position. Pointer, keyboard, and pad handlers all call the same methods and
 * confirm() returns the same row-major target for every device.
 */

export interface SelectionPosition {
  row: number;
  col: number;
}

export interface SelectionTarget extends SelectionPosition {
  index: number;
}

export type SelectionDirection = 'up' | 'down' | 'left' | 'right';

function positiveModulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function totalItems(rows: readonly number[]): number {
  return rows.reduce((total, length) => total + Math.max(0, Math.floor(length)), 0);
}

function normalizedRows(rows: readonly number[]): number[] {
  return rows.map((length) => Math.max(0, Math.floor(length))).filter((length) => length > 0);
}

/** Return the row/column position for a row-major index. */
function positionForIndex(rows: readonly number[], index: number): SelectionPosition {
  let remaining = index;
  for (let row = 0; row < rows.length; row++) {
    const length = rows[row]!;
    if (remaining < length) return { row, col: remaining };
    remaining -= length;
  }
  const lastRow = Math.max(0, rows.length - 1);
  return { row: lastRow, col: Math.max(0, (rows[lastRow] ?? 1) - 1) };
}

/** Return a row-major index for a valid position. */
function indexForPosition(rows: readonly number[], position: SelectionPosition): number {
  return rows.slice(0, position.row).reduce((total, length) => total + length, 0) + position.col;
}

export class MenuSelection {
  private rowLengths: number[];
  private current: SelectionPosition;

  constructor(rows: readonly number[], initial?: SelectionPosition | number) {
    this.rowLengths = normalizedRows(rows);
    if (this.rowLengths.length === 0) throw new Error('MenuSelection needs at least one target');
    const index = typeof initial === 'number' ? initial : initial ? indexForPosition(this.rowLengths, initial) : 0;
    this.current = positionForIndex(this.rowLengths, positiveModulo(index, totalItems(this.rowLengths)));
  }

  get position(): SelectionPosition {
    return { ...this.current };
  }

  get selectedIndex(): number {
    return indexForPosition(this.rowLengths, this.current);
  }

  get rowCount(): number {
    return this.rowLengths.length;
  }

  get rowLengthsSnapshot(): readonly number[] {
    return [...this.rowLengths];
  }

  get target(): SelectionTarget {
    return { ...this.current, index: this.selectedIndex };
  }

  /**
   * Reconcile a render/state change without handing selection to the DOM.
   * The previous row-major target is retained where possible; if rows shrink,
   * it clamps to the last remaining target.
   */
  setRows(rows: readonly number[], preserve = true): void {
    const next = normalizedRows(rows);
    if (next.length === 0) throw new Error('MenuSelection needs at least one target');
    const oldIndex = this.selectedIndex;
    this.rowLengths = next;
    const nextIndex = preserve ? Math.min(oldIndex, totalItems(next) - 1) : 0;
    this.current = positionForIndex(next, nextIndex);
  }

  select(position: SelectionPosition): SelectionTarget {
    const row = positiveModulo(Math.floor(position.row), this.rowLengths.length);
    const col = positiveModulo(Math.floor(position.col), this.rowLengths[row]!);
    this.current = { row, col };
    return this.target;
  }

  selectIndex(index: number): SelectionTarget {
    this.current = positionForIndex(this.rowLengths, positiveModulo(Math.floor(index), totalItems(this.rowLengths)));
    return this.target;
  }

  /** Direct pointer selection; kept named separately to make input parity explicit. */
  pointer(position: SelectionPosition): SelectionTarget {
    return this.select(position);
  }

  move(direction: SelectionDirection): SelectionTarget {
    if ((direction === 'up' || direction === 'down') && this.rowLengths.length === 1) {
      const delta = direction === 'down' ? 1 : -1;
      const length = this.rowLengths[0]!;
      this.current.col = positiveModulo(this.current.col + delta, length);
      return this.target;
    }
    if (direction === 'left' || direction === 'right') {
      const length = this.rowLengths[this.current.row]!;
      const delta = direction === 'right' ? 1 : -1;
      this.current.col = positiveModulo(this.current.col + delta, length);
      return this.target;
    }

    const delta = direction === 'down' ? 1 : -1;
    const nextRow = positiveModulo(this.current.row + delta, this.rowLengths.length);
    const oldLength = this.rowLengths[this.current.row]!;
    const nextLength = this.rowLengths[nextRow]!;
    const ratio = oldLength <= 1 ? 0 : this.current.col / (oldLength - 1);
    this.current = {
      row: nextRow,
      col: Math.min(nextLength - 1, Math.max(0, Math.round(ratio * (nextLength - 1))))
    };
    return this.target;
  }

  /** Confirm is intentionally read-only: the scene decides what the target does. */
  confirm(): SelectionTarget {
    return this.target;
  }
}
