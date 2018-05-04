# Yerna

[![CircleCI](https://img.shields.io/circleci/project/github/nomcopter/yerna/master.svg)](https://circleci.com/gh/nomcopter/yerna)
[![npm](https://img.shields.io/npm/v/yernapkg.svg)](https://www.npmjs.com/package/yernapkg)

> Yarn + Lerna = Yerna

Yerna is a monorepo management tool in the style of [Lerna](https://lernajs.io/),
but stripped down and using [Yarn](https://yarnpkg.com/) as the package manager.

## Disclaimer

The idea for Yerna stemmed from [a Lerna ticket suggesting Yarn integration](https://github.com/lerna/lerna/issues/371).
At the time, doing so in Lerna was nontrivial (see also [Lerna issue #605](https://github.com/lerna/lerna/pull/605)),
and long story short, I built [this giant bag of hacks](#how-it-works) to try it out myself.
It turns out that the benefits outweighed the costs pretty dramatically for my exact use case, so I cleaned it up for release, and here we are.

While I use Yerna heavily myself, it is still fundamentally a hack-based stopgap/overgrown experiment.
I am happy to discuss the feature set and its pros/cons in contrast to those of Lerna and Yarn, but note that **I will not be prioritizing feature requests or performing nontrivial maintenance** if it does not affect my own workflow.

Furthermore, the code is pretty sloppy in places, and I apologize in advance to any sensibilities that may be offended.
This is basically a glorified proof of concept, submitted to you for discussion and experimentation.

## Installation

**Note:** `yarn` is expected to already be installed and to exist on your `PATH` as Yerna will shell out to it.

```sh
yarn global add yernapkg
```

Also ensure that Yarn's globally-installed binaries are accessible on your `PATH`.

## Usage

**Note:** Please also read the [Caveats/Known Issues](#caveatsknown-issues)!

Yerna provides two binaries: `yerna` itself and a helper `yarnhack`.

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

Yerna is backwards-compatible with Lerna, in that it puts the repo into a valid state for Lerna. You can continue to use Lerna for features missing from Yerna (such as publishing), though be sure to [read the caveats/known issues](#caveatsknown-issues), in particular, the [behavior around symlinks](#symlinks).

Yerna does not read or write any Lerna-specific files on the filesystem (except for a logfile); in particular, it does not read `lerna.json`.

You can customise the paths where Yerna looks for packages by adding a `yerna.json` file:

```json
{
  "packages": [
    "packages/*",
    "elsewhere/*"
  ]
}
```

This works in the same way as Lerna. The configuration file does not support any other properties.

### Caveats/Known Issues

#### Parallel `install` failures

`yerna install` can sometimes die with an error mentioning a failure to find/write/unlink files in the Yarn cache directory. An example:

```
yarn install v0.21.3
[1/4] Resolving packages...
[2/4] Fetching packages...
error Couldn't find a package.json file in "/home/ubuntu/.cache/yarn/<some library name>"
info Visit https://yarnpkg.com/en/docs/cli/install for documentation about this command.
```

This can happen when multiple Yarn processes are installing and at least one is writing to the cache, i.e., you have a lot of new packages to install. A temporary workaround is to serialize the installation with `--parallel 1`. Further installs should be read-heavy, since the cache is populated, and not run into the same issue (at least, until your cache gets old again and hits the same issue).

#### `package.json` mangling

See [How It Works](#how-it-works) for details on how Yerna makes Yarn work, but in short, it involves mangling `package.json`s on the filesystem temporarily. In most cases, these manglings should be transparent, but problems could arise if you e.g. do git operations while `yerna` or `yarnhack` are running. A severe fatal error could also cause one of these tools to abort without cleaning up after itself.

#### Symlinks

Both `yerna` and `yarnhack` assume that all local packages should _always_ be symlinked. This means that they will:

- remove anything that's in the way of placing a symlink, even if it's a directory or regular file
- automatically generate symlinks before/after most operations as a convenience (so you almost never have to run `yerna link`)

### npm Lifecycle Scripts

npm install-related lifecycle scripts (namely `preinstall`, `postinstall` and `prepublish`) will not work properly, or at all, if they depend on local packages. Yarn will attempt to run these tasks, but because local package references were removed, such scripts will fail to run. There is no way that I know of using Yarn in this manner that would allow symlinking before the tasks are run short of prefixing `yerna link` before every such script.

## Motivation

Originally, Yerna was written because Lerna had no Yarn support. Now that it does, the gap is smaller, but the primary improvements that Yerna offers are the following:

- inclusion of `yarnhack`, which is necessary for adding/removing packages if you don't want Yarn to overwrite your symlinks every time
- `--dependencies` and `--dependents` flags for all task types
- `--force` flag for ignoring task failures
- dedicated `link` task
- support for multiply-specified `--include` (Lerna: `--scope`) and `--exclude` (Lerna: `--ignore`)
- sectioned/labeled stdout so you can tell which packages are generating what output
- automatic re-symlinking on task start/completion
- improved throughput for (always-on) topological sorting and cycle detection

I've [filed a few issues on Lerna](https://github.com/lerna/lerna/issues/created_by/seansfkelley) to track adding some of these features.

The goal is for Yerna to serve as a reasonable stop-gap until [Lerna gets merged into Yarn](https://github.com/yarnpkg/yarn/issues/946#issuecomment-264597575), at which point it should be mostly or entirely obsoleted by vanilla Yarn.

## How it Works

Hacks. Filthy, awful hacks.

Yarn demands complete control over `node_modules`. This is reasonable; the only reason that Lerna worked "seamlessly" is because npm was lenient about the structure and content of `node_modules` (as long as it appeared to satify the constraints in `package.json`). Lerna was free to make all kinds of symlinks and npm would happily chug along ignoring them. Yarn, in its strictness, will clear out these symlinks _and_ will attempt to download packages that we know to be local-only.

The workaround is to wrap Yarn in a task that mangles the `package.json`s to remove all local references before running Yarn. In practice, this works great, but the failure mode can be very confusing for those who aren't intimately familiar with how `node_modules`, npm and Yarn work. It also means that Yarn is free to delete all your symlinks and pretty much any time (as a convenience, `yerna` and `yarnhack` will re-link packages any time Yarn was run).

## Contributors

Original Author: [@seansfkelley](https://github.com/seansfkelley)
