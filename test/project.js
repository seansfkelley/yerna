const fs = require('fs');
const path = require('path');
const test = require('tape');
const proxyquire = require('proxyquire');
const tmp = require('tmp')
const mockBin = require('mock-bin')

const originalCwd = process.cwd()

test('git root', (t) => {
  const {PROJECT_ROOT} = proxyquire('../lib/project', {});
  t.equal(PROJECT_ROOT, path.join(__dirname, '..'));

  t.end();
});

test('yerna.json root', (t) => {
  mockBin('git', 'node', 'process.exit(1)').then((unmock) => {
    const projectDir = path.join(__dirname, 'fixture-project');
    const childDir = path.join(projectDir, 'child');

    process.chdir(childDir);

    const {PROJECT_ROOT} = proxyquire('../lib/project', {});
    t.equal(PROJECT_ROOT, projectDir);

    process.chdir(originalCwd);
    unmock();
    t.end();
  });
});

test('error if no git root or yerna.json', (t) => {
  mockBin('git', 'node', 'process.exit(1)').then((unmock) => {
    const dir = tmp.dirSync({unsafeCleanup: true}).name;
    process.chdir(dir);

    try {
      proxyquire('../lib/project', {});
    } catch (error) {
      t.pass(error);
      t.ok(error.toString().indexOf("yerna: Can't find project root") !== -1);
    }

    process.chdir(originalCwd);
    unmock();
    t.end();
  });
});
