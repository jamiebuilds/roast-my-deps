#!/usr/bin/env node
// @flow
'use strict';
const meow = require('meow');
const path = require('path');
const chalk = require('chalk');
const findUp = require('find-up');
const arrify = require('arrify');
const prettyBytes = require('pretty-bytes');
const Table = require('cli-table');
const roastMyDeps = require('./');

const cli = meow({
  help: `
    $ roast-my-deps [...source files globs] <...flags>


    Flags
      --config, -c <config>      Custom Webpack Config
      --ignore, -i <dep name>    Ignore packages (can be globs)
      --only, -o <dep name>      Only bundle certain packages
      --verbose, -v, --debug     Stream stdout/stderr from Rollup

    Examples
      $ roast-my-deps
      $ roast-my-deps 'src/**/*.js' '!**/__tests__/**'
      $ roast-my-deps --config ./path/to/your/custom/rollup.config.js
      $ roast-my-deps -i dep-a -i dep-b
      $ roast-my-deps -i dep-with-glob-*
      $ roast-my-deps --only dep-a
      $ roast-my-deps --only _all
  `,
  flags: {
    config: {
      type: 'string',
  		alias: 'c'
    },
    ignore: {
      type: 'array',
  		alias: 'i'
    },
    only: {
      type: 'array',
  		alias: 'o'
    },
    verbose: {
      type: 'boolean',
      alias: ['v', 'debug'],
      default: false,
    }
  }
});

async function main() {
  try {
    let cwd = process.cwd();
    let pkgPath = await findUp('package.json');

    if (!pkgPath) {
      console.error('Could not find a package.json from the current directory');
      return process.exit(1);
    }

    let results = await roastMyDeps(pkgPath, {
      sourceGlobs: cli.input,
      config: cli.flags.config,
      ignore: arrify(cli.flags.ignore),
      only: arrify(cli.flags.only),
      verbose: cli.flags.verbose
    });

    let table = new Table({
      head: ['Name', 'min', 'min+gz']
    });

    results.forEach(result => {
      table.push([
        result.entry.name === '_all' ? chalk.bold.yellow('All'): result.entry.name,
        prettyBytes(result.sizes.outputBytes),
        prettyBytes(result.sizes.outputBytesGz),
      ]);
    });

    console.log(table.toString());
  } catch (err) {
    console.error(err);
    return process.exit(1);
  }

  return process.exit(0);
}

main();
