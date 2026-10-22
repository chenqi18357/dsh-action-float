/**
 * Line diff helpers for the Action Float plugin.
 *
 * The plugin only needs a stable, line-oriented edit script with line numbers.
 * Small and medium changes use an LCS table; very large replacements fall back
 * to "delete the old middle, add the new middle" so a giant rewrite can still
 * be summarized without allocating an enormous matrix.
 */

export const MAX_DETAIL_ROWS = 2000;
export const LCS_CELL_LIMIT = 4_000_000;

/** Split text into lines without inventing a phantom line for a trailing \n. */
export function splitLines(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Replace tabs and control characters so one row stays one visual line. */
export function cleanLine(text) {
  return String(text ?? '')
    .replace(/\t/g, '  ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

/**
 * Diff two texts line by line.
 *
 * @returns {Array<{type: 'add'|'del', text: string, oldLine: number|null, newLine: number|null}>}
 */
export function diffLines(oldText, newText) {
  const oldAll = splitLines(oldText);
  const newAll = splitLines(newText);

  let prefix = 0;
  while (
    prefix < oldAll.length &&
    prefix < newAll.length &&
    oldAll[prefix] === newAll[prefix]
  ) {
    prefix += 1;
  }

  let oldEnd = oldAll.length;
  let newEnd = newAll.length;
  while (
    oldEnd > prefix &&
    newEnd > prefix &&
    oldAll[oldEnd - 1] === newAll[newEnd - 1]
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const oldMid = oldAll.slice(prefix, oldEnd);
  const newMid = newAll.slice(prefix, newEnd);
  const rows = [];

  if (oldMid.length === 0) {
    for (let j = 0; j < newMid.length; j += 1) {
      rows.push({ type: 'add', text: newMid[j], oldLine: null, newLine: prefix + j + 1 });
    }
    return rows;
  }
  if (newMid.length === 0) {
    for (let i = 0; i < oldMid.length; i += 1) {
      rows.push({ type: 'del', text: oldMid[i], oldLine: prefix + i + 1, newLine: null });
    }
    return rows;
  }

  if (oldMid.length * newMid.length > LCS_CELL_LIMIT) {
    for (let i = 0; i < oldMid.length; i += 1) {
      rows.push({ type: 'del', text: oldMid[i], oldLine: prefix + i + 1, newLine: null });
    }
    for (let j = 0; j < newMid.length; j += 1) {
      rows.push({ type: 'add', text: newMid[j], oldLine: null, newLine: prefix + j + 1 });
    }
    return rows;
  }

  const n = oldMid.length;
  const m = newMid.length;
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = i * width;
    const next = (i + 1) * width;
    for (let j = m - 1; j >= 0; j -= 1) {
      if (oldMid[i] === newMid[j]) {
        dp[row + j] = dp[next + j + 1] + 1;
      } else {
        const down = dp[next + j];
        const right = dp[row + j + 1];
        dp[row + j] = down >= right ? down : right;
      }
    }
  }

  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && oldMid[i] === newMid[j]) {
      i += 1;
      j += 1;
      continue;
    }
    // On a tie, emit the deletion first so a replacement reads as old (red)
    // and then new (green), never the other way around.
    const canAdd = j < m;
    const canDel = i < n;
    const addScore = canAdd ? dp[i * width + j + 1] : -1;
    const delScore = canDel ? dp[(i + 1) * width + j] : -1;
    if (canAdd && (!canDel || addScore > delScore)) {
      rows.push({ type: 'add', text: newMid[j], oldLine: null, newLine: prefix + j + 1 });
      j += 1;
    } else {
      rows.push({ type: 'del', text: oldMid[i], oldLine: prefix + i + 1, newLine: null });
      i += 1;
    }
  }
  return rows;
}

export function countRows(rows) {
  let added = 0;
  let removed = 0;
  for (const row of rows) {
    if (row.type === 'add') added += 1;
    else if (row.type === 'del') removed += 1;
  }
  return { added, removed };
}

/**
 * Keep a compact preview within `max` rows. A large change keeps a few
 * representative lines and folds the rest into one summary row.
 */
export function compactRows(rows, max = 5) {
  if (rows.length <= max) return rows.slice();
  const keep = max - 1;
  // Keep both ends of the edit script: a replacement then shows red old lines
  // and green new lines instead of only the first run of deletions.
  const head = Math.min(2, keep);
  const tail = Math.max(0, keep - head);
  const picked = [
    ...rows.slice(0, head),
    ...(tail > 0 ? rows.slice(rows.length - tail) : []),
  ];
  return [
    ...picked,
    {
      type: 'summary',
      text: '',
      oldLine: null,
      newLine: null,
      omitted: rows.length - picked.length,
    },
  ];
}

/** Detail rows capped to a useful size, preserving both ends of a huge diff. */
export function detailRows(rows, limit = MAX_DETAIL_ROWS) {
  if (rows.length <= limit) return { rows: rows.slice(), truncated: false };
  const head = Math.floor(limit / 2);
  const tail = limit - 1 - head;
  return {
    rows: [
      ...rows.slice(0, head),
      {
        type: 'summary',
        text: '',
        oldLine: null,
        newLine: null,
        omitted: rows.length - head - tail,
      },
      ...rows.slice(rows.length - tail),
    ],
    truncated: true,
  };
}
