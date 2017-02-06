# Yerna

> Yarn + Lerna = Yerna

Yerna is a monorepo management tool in the style of [Lerna](https://lernajs.io/), but stripped down and using [Yarn](https://yarnpkg.com/) as the package manager.

## Disclaimer

The idea for Yerna stemmed from [a Lerna ticket suggesting Yarn integration](https://github.com/lerna/lerna/issues/371). Doing so in Lerna is nontrivial, and long story short, I built [this giant bag of hacks](#how-it-works) to try it out myself. It turns out that the benefits outweighed the costs pretty dramatically for my exact use case, so I cleaned it up for release, and here we are.

While I use Yerna heavily myself, it is still fundamentally a hack-based stopgap/overgrown experiment. I am happy to discuss the feature set and its pros/cons in contrast to those of Lerna and Yarn, but note that **I will not be prioritizing feature requests or performing nontrivial maintenance** if it does not affect my own workflow.

Furthermore, the code is pretty sloppy in places, and I apologize in advance to any sensibilities that may be offended. This is basically a glorified proof of concept, submitted to you for discussion and experimentation.

## Installation

**Note:** `yarn` is expected to already be installed and to exist on your `PATH` as Yerna will shell out to it.

```sh
yarn global add yernapkg
```

Also ensure that Yarn's globally-installed binaries are accessible on your `PATH`.

## Usage

**Note:** Please also read the [Caveats](#caveats)!

Yerna provides two binaries: `yerna` itself and a helper `yarnhack`. Both tools assume that they're running out of a git repo where packages are direct descendants of `<git root>/packages`.

### `yerna`

`yerna` is a tool for running tasks over one or more local packages, using Yarn, in parallel. `yerna` provides a few different commands, listed briefly below. Note that all commands:

- respect the package-selection flags (`--include`, etc.) unless otherwise noted
- respect the dependency ordering of packages when running tasks

Run `yerna --help` for more information on the supported commands and flags.


command          | description                                            | notes
---------------- | ------------------------------------------------------ | -----
install          | install all external packages, link all local packages |
link             | link all local packages without installing             | ignores flags
list             | list selected packages                                 | useful for testing flag combinations
run \<script\>   | run the npm script \<script\> in packages              |
exec \<command\> | run shell command \<command\> in packages              |

### `yarnhack`

`yarnhack` is an executable that wraps Yarn and mangles `package.json` to prevent Yarn from trying to install packages that don't exist on the registry. Otherwise, it forwards directly to the system-installed `yarn` and understands all commands and flags defined there.

### Usage with Lerna

Yerna is backwards-compatible with Lerna, in that it puts the repo into a valid state for Lerna. You can continue to use Lerna for features missing from Yerna (such as publishing), though be sure to [read the caveats](#caveats), in particular, the [behavior around symlinks](#symlinks).

Yerna does not read or write any Yerna- or Lerna-specific files on the filesystem (except for a logfile); in particular, it does not read `lerna.json`.

### Caveats

#### `package.json` mangling

See [How It Works](#how-it-works) for details on how Yerna makes Yarn work, but in short, it involves mangling `package.json`s on the filesystem temporarily. In most cases, these manglings should be transparent, but problems could arise if you e.g. do git operations while `yerna` or `yarnhack` are running. A severe fatal error could also cause one of these tools to abort without cleaning up after itself.

#### Symlinks

Both `yerna` and `yarnhack` assume that all local packages should _always_ be symlinked. This means that they will:

- remove anything that's in the way of placing a symlink, even if it's a directory or regular file
- automatically generate symlinks before/after most operations as a convenience (so you almost never have to run `yerna link`)

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
