import { addProductToCart, CartChange, decrementCartLine } from '@/src/domain/pos';
import { CartLine, Product } from '@/src/types';

/**
 * Cart state as a reducer so every mutation goes through one guarded path.
 * The cart screen can no longer reach an unchecked add, and the Clear All undo
 * buffer cannot outlive the mutation that invalidates it.
 */

/** How long the Clear All undo stays reachable. */
export const CLEAR_UNDO_WINDOW_MS = 5000;

export type CartState = {
  lines: CartLine[];
  /** Snapshot held for the Clear All undo window; null when no undo is offered. */
  undo: { lines: CartLine[]; expiresAt: number } | null;
};

export const emptyCartState: CartState = { lines: [], undo: null };

export type CartAction =
  | { type: 'add'; product: Product }
  | { type: 'increment'; productId: string }
  | { type: 'decrement'; productId: string }
  | { type: 'clear'; at: number }
  | { type: 'undo-clear'; at: number }
  | { type: 'discard-undo' }
  | { type: 'reset' }
  | { type: 'replace-lines'; lines: CartLine[] };

export type CartReduction = {
  state: CartState;
  /** Result of a guarded add or increment, for the caller that shows the message. */
  change?: CartChange;
  /** Lines the last clear removed, for the undo label. */
  clearedLines?: CartLine[];
  /** True only when an undo actually restored a cart. */
  restored?: boolean;
};

export function reduceCart(state: CartState, action: CartAction): CartReduction {  switch (action.type) {
    case 'add':
      return addReduction(state, action.product);

    case 'increment': {
      const line = state.lines.find((item) => item.product.id === action.productId);
      if (!line) {
        return {
          state,
          change: { ok: false, cart: state.lines, message: 'This item is no longer in the cart. Add it again from search or by scanning it.' },
        };
      }
      // Incrementing targets the stored line, not a product object the screen
      // happens to be holding, so the stock guard always reads one snapshot.
      return addReduction(state, line.product);
    }

    case 'decrement': {
      const lines = decrementCartLine(state.lines, action.productId);
      // A quantity decrement keeps the line count, so compare quantities too.
      const changed = lines.length !== state.lines.length
        || lines.some((line, index) => line.quantity !== state.lines[index]?.quantity);
      if (!changed) return { state };
      return { state: { lines, undo: null } };
    }

    case 'clear': {
      if (state.lines.length === 0) return { state };
      return {
        state: { lines: [], undo: { lines: state.lines, expiresAt: action.at + CLEAR_UNDO_WINDOW_MS } },
        clearedLines: state.lines,
      };
    }

    case 'undo-clear': {
      if (!state.undo || action.at > state.undo.expiresAt) {
        return { state: state.undo ? { lines: state.lines, undo: null } : state, restored: false };
      }
      return { state: { lines: state.undo.lines, undo: null }, restored: true };
    }

    case 'discard-undo':
      return state.undo ? { state: { lines: state.lines, undo: null } } : { state };

    // A completed or handed-over sale clears the cart without offering an undo:
    // undoing it here could resurrect a cart Laravel has already recorded.
    case 'reset':
      return { state: emptyCartState };

    case 'replace-lines':
      return { state: { lines: action.lines, undo: null } };
  }
}

/**
 * The `useReducer` form of the same pure reduction. `commitCart` uses the
 * reduction (so callers can read the guard message) and dispatches this, so
 * both forms are always one function apart.
 */
export function cartReducer(state: CartState, action: CartAction): CartState {
  return reduceCart(state, action).state;
}

function addReduction(state: CartState, product: Product): CartReduction {
  const change = addProductToCart(state.lines, product);
  // A rejected add is not a cart mutation, so an open undo buffer stays valid.
  if (!change.ok) return { state, change };
  return { state: { lines: change.cart, undo: null }, change };
}

/** Number of units in a cart, for labels that should say "3 items". */
export function cartUnitCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
