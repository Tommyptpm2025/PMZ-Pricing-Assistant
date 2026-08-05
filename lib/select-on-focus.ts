import type * as React from "react";

/**
 * selectOnFocusProps — spread onto ANY numeric entry field so that focusing it (by click OR by Tab)
 * selects the whole value, and the first keystroke REPLACES it.
 *
 * THE DEFECT THIS FIXES: numeric fields default to 1. Clicking one put a caret beside the 1 instead
 * of selecting it, so typing "5" produced "51" — a line meant to be 5 hours priced out at $4,522.
 * The value the owner typed and the value the quote used were different numbers, silently.
 *
 * NUMBERS ONLY. Never spread this onto a text field — selecting a whole description on focus would
 * make one keystroke destroy it.
 *
 * Display/interaction only: it changes what is SELECTED, never a value, a handler, or any math.
 *
 * WHY THREE HANDLERS AND NOT JUST onFocus. Focus fires on mousedown; the mouseup that ends the same
 * click then places a caret and collapses the selection we just made — so onFocus alone works for
 * Tab and quietly fails for the click, which is how the field is actually used. onMouseDown records
 * whether the field was ALREADY focused: if it was, the user is placing a caret in a value they are
 * mid-edit on and we never interfere; if it was not, this click is the focusing click and its
 * mouseup is swallowed so the selection survives.
 *
 * Spread it FIRST so a field with its own onFocus/onBlur keeps its own (later props win):
 *   <Input type="number" {...selectOnFocusProps} onBlur={...} />
 */

// The field whose focusing click is still in flight — armed on mousedown, spent on mouseup. Module
// scope is correct: only one pointer press can be in flight at a time, whatever the field.
let focusingClickTarget: HTMLInputElement | null = null;

export const selectOnFocusProps = {
  onMouseDown(e: React.MouseEvent<HTMLInputElement>) {
    // Already focused → the user is placing a caret inside a value they are editing. Hands off.
    focusingClickTarget =
      typeof document !== "undefined" && document.activeElement === e.currentTarget
        ? null
        : e.currentTarget;
  },
  onFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.select();
  },
  onMouseUp(e: React.MouseEvent<HTMLInputElement>) {
    if (focusingClickTarget === e.currentTarget) e.preventDefault(); // keep the selection, drop the caret
    focusingClickTarget = null;
  },
};
