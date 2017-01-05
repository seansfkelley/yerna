# Yerna

> Yarn + Lerna = Yerna

Yerna is a monorepo management tool in the style of [Lerna](https://lernajs.io/), but stripped down and using [Yarn](https://yarnpkg.com/) as the package manager.

## Installation

**Note:** `yarn` is expected to already be installed and to exist on your `PATH` as Yerna will shell out to Yarn.

Yerna is not yet published anywhere, so you have to run it from your clone:

```sh
git clone <this repo>
cd yerna
yarn install
cd path/to/your/repo
../path/to/bin/yerna install
```

## Replacing Lerna

```sh
npm uninstall -g lerna
cd path/to/your/repo
rm lerna.json
yerna install
```

## Usage

**Note:** Please also read the [Caveats](#caveats)!

Yerna provides two binaries: `yerna` itself and a helper `yarnhack`. Both tools assume that they're running out of a git repo where packages are direct descendants of `<git root>/packages`.

### `yerna`

`yerna` is a tool for running tasks over one or more local packages, using Yarn, in parallel. Run `yerna --help` for information on the supported commands and flags.

### `yarnhack`

`yarnhack` is an executable that wraps Yarn and mangles `package.json` to prevent Yarn from trying to install packages that don't exist on the registry. Otherwise, it forwards directly to the system-installed `yarn` and understands all commands and flags defined there.

### Caveats

#### `package.json` mangling

See [How It Works](#how-it-works) for details on how Yerna makes Yarn work, but in short, it involves mangling `package.json`s on the filesystem temporarily. In most cases, these manglings should be transparent, but problems could arise if you e.g. do git operations while `yerna` or `yarnhack` are running. A severe fatal error could also cause one of these tools to abort without cleaning up after itself.

#### Symlinks

Both `yerna` and `yarnhack` will generally automatically symlink packages to one another after completing their task. This should make explicit use of `yerna link` very rare, but the option is always there if you e.g. run `yarn` directly and remove symlinks.

### npm Lifecycle Scripts

npm install-related lifecycle scripts (namely `preinstall`, `postinstall` and `prepublish`) will not work properly, or at all, if they depend on local packages. Yarn will attempt to run these tasks, but because local package references were removed, such scripts will fail to run. There is no way that I know of using Yarn in this manner that would allow symlinking before the tasks are run short of prefixing `yerna link` before every such script.

## Motivation

The "Lerna monorepo model" is simple and works reasonably well, but at scale, npm itself falters and causes delays (slow, filesystem-heavy operations) and breaks (nondeterministic installation). Swapping out the npm behaviors for Yarn improves both automated build stability/speed and devex considerably.

Additionally, there were a handful of features I found useful that have not been merged into Lerna or are not appropriate for Lerna, as well as Lerna features I do not need. All together, these changes were easier to implement as a new tool rather than a fork of Lerna.

Hopefully this repo serves as a reasonable stop-gap until [Lerna gets merged into Yarn](https://github.com/yarnpkg/yarn/issues/946#issuecomment-264597575), at which point it should be mostly or entirely obsoleted by vanilla Yarn.

## How it Works

Hacks. Filthy, awful hacks.

Yarn demands complete control over `node_modules`. This is reasonable; the only reason that Lerna worked "seamlessly" is because npm was lenient about the structure and content of `node_modules` (as long as it appeared to satify the constraints in `package.json`). Lerna was free to make all kinds of symlinks and npm would happily chug along ignoring them. Yarn, in its strictness, will clear out these symlinks _and_ will attempt to download packages that we know to be local-only.

The workaround is to wrap Yarn in a task that mangles the `package.json`s to remove all local references before running Yarn. In practice, this works great, but the failure mode can be very confusing for those who aren't intimately familiar with how `node_modules`, npm and Yarn work. It also means that Yarn is free to delete all your symlinks and pretty much any time (as a convenience, `yerna` and `yarnhack` will re-link packages any time Yarn was run).
