const fs = require('fs');
const path = require('path');
const test = require('tape');
const proxyquire = require('proxyquire');
const tmp = require('tmp')
const mockBin = require('mock-bin')

const originalCwd = process.cwd()

test('git root', (t) => {
  t.plan(1);

  const {PROJECT_ROOT} = proxyquire('../lib/project', {});
  t.equal(PROJECT_ROOT, path.join(__dirname, '..'));
});

test('yerna.json root', (t) => {
  t.plan(1);

  mockBin('git', 'node', 'process.exit(1)').then((unmock) => {
    const projectDir = path.join(__dirname, 'fixture-project');
    const childDir = path.join(projectDir, 'child');

    process.chdir(childDir);

    const {PROJECT_ROOT} = proxyquire('../lib/project', {});
    t.equal(PROJECT_ROOT, projectDir);

    process.chdir(originalCwd);
    unmock();
  });
});

test('error if no git root or yerna.json', (t) => {
  t.plan(1);

  mockBin('git', 'node', 'process.exit(1)').then((unmock) => {
    const dir = tmp.dirSync({unsafeCleanup: true}).name;
    process.chdir(dir);

    t.throws(() => {
      proxyquire('../lib/project', {});
    }, new RegExp('Can\'t find project root'));

    process.chdir(originalCwd);
    unmock();
  });
});
