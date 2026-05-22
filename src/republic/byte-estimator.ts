/**
 * Fast byte-size estimation utilities.
 *
 * Walks the object graph counting string lengths without allocating a
 * serialized copy. ~5x faster than JSON.stringify().length for typical
 * data structures. Useful for budget gates and diagnostics where we need
 * an approximate size to make a branching decision.
 */

/** Estimate the JSON-serialized byte size of an array without allocating */
export function estimateArrayBytes(arr: unknown[]): number {
  let size = 2; // opening/closing brackets
  for (const item of arr) {
    size += estimateValueBytes(item) + 1; // +1 for comma
  }
  return size;
}

/** Estimate the JSON-serialized byte size of any value without allocating */
export function estimateValueBytes(val: unknown): number {
  if (val === null || val === undefined) {
    return 4;
  } // "null"
  if (typeof val === "string") {
    return val.length + 2;
  } // quotes
  if (typeof val === "number" || typeof val === "boolean") {
    return 8;
  } // avg
  if (Array.isArray(val)) {
    let s = 2; // brackets
    for (const v of val) {
      s += estimateValueBytes(v) + 1;
    }
    return s;
  }
  if (typeof val === "object") {
    let s = 2; // braces
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      s += k.length + 4 + estimateValueBytes(v); // key + quotes + colon + comma
    }
    return s;
  }
  return 10; // fallback
}

/** Estimate the JSON-serialized byte size of a Record object without allocating */
export function estimateObjectBytes(obj: Record<string, unknown>): number {
  return estimateValueBytes(obj);
}
