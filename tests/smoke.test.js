const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

test('running tool.js without args prints usage and exits with status 1', () => {
  const result = spawnSync('node', ['tool.js'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});

test('running tool.js build without manifest exits with error', () => {
  const result = spawnSync('node', ['tool.js', 'build', '--manifest', 'nonexistent.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
});

test('running tool.js with an invalid command prints usage and exits with status 1', () => {
  const result = spawnSync('node', ['tool.js', 'deploy', 'My', 'Album'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});
