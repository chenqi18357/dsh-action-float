import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('manifest is the published dsh-action-float bundle', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'dsh-action-float')
  assert.equal(manifest.version, '1.0.1')
  assert.equal(manifest.license, 'MIT')
  assert.equal(manifest.author, 'chenqi18357')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.exports['.'], './index.js')
  assert.equal(manifest.exports['./client'], './client.js')
  for (const file of [
    'index.js',
    'client.js',
    'diff.js',
    'cordis.patch.yml',
    'README.md',
    'README.zh.md',
    'LICENSE',
  ]) {
    assert.ok((await stat(join(root, file))).isFile(), `${file} exists`)
  }
})

test('client module id matches the package name', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const client = await readFile(join(root, 'client.js'), 'utf8')
  assert.match(client, new RegExp(`id:\\s*'${manifest.name}'`))
})

test('license is MIT and credits the author', async () => {
  const license = await readFile(join(root, 'LICENSE'), 'utf8')
  assert.match(license, /^MIT License/)
  assert.match(license, /Copyright \(c\) 2026 chenqi18357/)
  assert.match(license, /Permission is hereby granted, free of charge/)
})

test('bundled locale metadata is meaningful in Chinese and English', async () => {
  for (const locale of ['zh', 'en']) {
    const data = JSON.parse(await readFile(join(root, 'locale', `${locale}.json`), 'utf8'))
    assert.ok(data.meta.title.length > 1)
    assert.ok(data.meta.description.length > 10)
  }
})

test('uses the host default icon', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.exports['./icon'], undefined)
  await assert.rejects(stat(join(root, 'icon.svg')))
})

test('overlay uses the safe composer dock, not a custom chat node', async () => {
  const client = await readFile(join(root, 'client.js'), 'utf8')
  assert.match(client, /const USE_INLINE_CHAT_NODE = false/)
  assert.match(client, /const ANCHORED_DOCK = true/)
  assert.match(client, /conversation\.input\.dock/)
})

test('placement measures the reply block and composer, then takes the higher anchor', async () => {
  const client = await readFile(join(root, 'client.js'), 'utf8')
  assert.match(client, /data-chat-flow-kind="user"/)
  assert.match(client, /data-chat-turn/)
  assert.match(client, /data-composer-card/)
  assert.match(client, /Math\.max\(12,\s*Math\.min\(\.\.\.candidates\)\)/)
  assert.match(client, /shellStyle\.bottom = '128px'/)
})

test('readability layer is text-first with radial scrims and a hover box', async () => {
  const client = await readFile(join(root, 'client.js'), 'utf8')
  assert.match(client, /text-shadow:/)
  assert.match(client, /background:\s*radial-gradient/)
  assert.match(client, /backdrop-filter:\s*blur\(5px\)/)
  assert.match(client, /mask-image:/)
  assert.match(client, /\.dsh-action-float-shell\.af-inline:hover \.af-line/)
  assert.match(client, /\.af-line::after/)
  assert.match(client, /width:\s*max-content/)
  assert.match(client, /width:\s*min\(var\(--dsh-composer-card-max-width,\s*760px\),\s*calc\(100vw - 32px\)\)/)
})
