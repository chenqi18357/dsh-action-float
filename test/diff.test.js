import test from 'node:test'
import assert from 'node:assert/strict'
import {
  compactRows,
  countRows,
  detailRows,
  diffLines,
  splitLines,
} from '../diff.js'

test('splitLines keeps real line numbers and drops only the trailing sentinel', () => {
  assert.deepEqual(splitLines('a\nb\n'), ['a', 'b'])
  assert.deepEqual(splitLines('a\nb'), ['a', 'b'])
  assert.deepEqual(splitLines(''), [])
  assert.deepEqual(splitLines('\n'), [''])
})

test('unchanged text has no operations', () => {
  assert.deepEqual(diffLines('a\nb\nc\n', 'a\nb\nc\n'), [])
})

test('insertions and deletions carry the right line numbers', () => {
  assert.deepEqual(diffLines('a\nc\n', 'a\nb\nc\n'), [
    { type: 'add', text: 'b', oldLine: null, newLine: 2 },
  ])
  assert.deepEqual(diffLines('a\nb\nc\n', 'a\nc\n'), [
    { type: 'del', text: 'b', oldLine: 2, newLine: null },
  ])
})

test('a replacement is emitted as the red old line then the green new line', () => {
  const rows = diffLines('a\nold\nc\n', 'a\nnew\nc\n')
  assert.deepEqual(rows, [
    { type: 'del', text: 'old', oldLine: 2, newLine: null },
    { type: 'add', text: 'new', oldLine: null, newLine: 2 },
  ])
})

test('line numbers stay correct across two hunks', () => {
  const oldText = '1\n2\n3\n4\n5\n6\n'
  const newText = '1\nTWO\n3\n4\nFIVE\n6\n'
  assert.deepEqual(diffLines(oldText, newText), [
    { type: 'del', text: '2', oldLine: 2, newLine: null },
    { type: 'add', text: 'TWO', oldLine: null, newLine: 2 },
    { type: 'del', text: '5', oldLine: 5, newLine: null },
    { type: 'add', text: 'FIVE', oldLine: null, newLine: 5 },
  ])
})

test('a brand-new file is all additions starting at line 1', () => {
  const rows = diffLines('', 'one\ntwo\nthree\n')
  assert.deepEqual(rows, [
    { type: 'add', text: 'one', oldLine: null, newLine: 1 },
    { type: 'add', text: 'two', oldLine: null, newLine: 2 },
    { type: 'add', text: 'three', oldLine: null, newLine: 3 },
  ])
})

test('compact preview is capped and folds the remainder into a summary row', () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    type: index % 2 === 0 ? 'del' : 'add',
    text: `line ${index}`,
    oldLine: index % 2 === 0 ? index + 1 : null,
    newLine: index % 2 === 0 ? null : index + 1,
  }))
  const compact = compactRows(rows, 5)
  assert.equal(compact.length, 5)
  assert.equal(compact[4].type, 'summary')
  assert.equal(compact[4].omitted, 4)
})

test('large rewrites use the bounded fallback and still have a summary', () => {
  const oldText = Array.from({ length: 2100 }, (_, index) => `old ${index}`).join('\n')
  const newText = Array.from({ length: 2100 }, (_, index) => `new ${index}`).join('\n')
  const rows = diffLines(oldText, newText)
  assert.equal(rows.length, 4200)
  assert.equal(rows[0].type, 'del')
  assert.equal(rows[rows.length - 1].type, 'add')
  assert.deepEqual(countRows(rows), { added: 2100, removed: 2100 })
  const compact = compactRows(rows, 5)
  assert.equal(compact.length, 5)
  assert.equal(compact[4].type, 'summary')
})

test('detail rows preserve both ends and flag truncation', () => {
  const rows = Array.from({ length: 2500 }, (_, index) => ({
    type: 'add',
    text: `line ${index}`,
    oldLine: null,
    newLine: index + 1,
  }))
  const detail = detailRows(rows, 100)
  assert.equal(detail.truncated, true)
  assert.equal(detail.rows.length, 100)
  assert.equal(detail.rows[50].type, 'summary')
  assert.equal(detail.rows[0].text, 'line 0')
  assert.equal(detail.rows[99].text, 'line 2499')
})
