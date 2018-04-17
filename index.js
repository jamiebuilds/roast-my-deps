// @flow
'use strict';
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const _spawn = require('spawndamnit');
const pLimit = require('p-limit');
const os = require('os');
const chalk = require('chalk');
const readPkg = require('read-pkg');
const globby = require('globby');
const prettyBytes = require('pretty-bytes');
const isBuiltinModule = require('is-builtin-module');
const micromatch = require('micromatch');
const REGEXES = require('./regexes');

const WEBPACK_BIN = path.join(__dirname, 'node_modules', '.bin', 'webpack-cli');
const DEFAULT_CONFIG = path.join(__dirname, 'config.js');
const DEFAULT_SOURCE_GLOBS = [
  '**/src/**/*.+(js|jsx|ts|tsx|babel)',
  '!**/*.{spec,test}.*',
  '!**/*.test.*',
  '!**/{__tests__,test,tests}/**',
];

const fsLimit = pLimit(process.env.UV_THREADPOOL_SIZE || 64);
const processLimit = pLimit(os.cpus().length);

const mkdir = (...args) => fsLimit(() => promisify(fs.mkdir)(...args));
const writeFile = (...args) => fsLimit(() => promisify(fs.writeFile)(...args));
const readFile = (...args) => fsLimit(() => promisify(fs.readFile)(...args));
const stat = (...args) => fsLimit(() => promisify(fs.stat)(...args));
const spawn = (...args) => processLimit(() => _spawn(...args));

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    } else {
      throw err;
    }
  }
}

async function ensureDir(dirPath) {
  try {
    await mkdir(dirPath);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function installDependencies(dirPath, isYarn, verbose) {
  let cmd = isYarn ? 'yarn' : 'npm';

  await spawn(cmd, ['install'], {
    cwd: dirPath,
    stdio: verbose ? 'inherit' : 'ignore',
  });
}

function isDepMatch(pkgName, importSpecifier, pkgNameGlob = false) {
  if (pkgName === importSpecifier) return true;
  if (importSpecifier.startsWith(pkgName + '/')) return true;
  if (pkgNameGlob && micromatch.isMatch(importSpecifier, pkgName)) return true;
  return false;
}

async function getExternalImports(sourceGlobs, rootDir, ignored) {
  let workspacePkgPaths = await globby([
    '**/package.json',
    '!**/node_modules/**',
  ], {
    cwd: rootDir,
  });

  let workspaceNames = await Promise.all(workspacePkgPaths.map(async pkgPath => {
    let pkg = await readPkg(pkgPath, { normalize: false });
    return pkg.name;
  }));

  let sourceFilePaths = await globby(sourceGlobs.concat([
    '!**/node_modules/**',
  ]), {
    cwd: rootDir,
    deep: true,
  });

  let importRegexMatches = new Set();

  await Promise.all(sourceFilePaths.map(async filePath => {
    let fileContents = await readFile(filePath, 'utf-8');

    REGEXES.forEach(regex => {
      fileContents.replace(regex, (portion, match) => {
        importRegexMatches.add(match);
      });
    });
  }));

  let externalImports = Array.from(importRegexMatches).filter(importSpecifier => {
    if (importSpecifier.startsWith('.')) return false;
    if (importSpecifier.startsWith('!')) return false;
    if (isBuiltinModule(importSpecifier)) return false;
    if (workspaceNames.find(name => isDepMatch(name, importSpecifier))) return false;
    if (ignored.length && ignored.find(name => isDepMatch(name, importSpecifier, true))) return false;
    return true;
  });

  return externalImports;
}

async function createEntry(cacheDir, kind, name, fileContents) {
  let id = name.replace(/\//g, '--');
  let input = path.join(cacheDir, id + '.js');
  let output = path.join(cacheDir, id + '.bundle.js');
  let outputGz = path.join(cacheDir, id + '.bundle.js.gz');
  await writeFile(input, fileContents);
  return { kind, name, id, input, output, outputGz, fileContents };
}

async function bundleEntry(configPath, cacheDir, entry, verbose) {
  let { code } = await spawn(WEBPACK_BIN, [
    '--config', configPath
  ], {
    cwd: cacheDir,
    stdio: verbose ? ['ignore', 'inherit', 'inherit'] : 'ignore',
    env: Object.assign({}, process.env, {
      ROAST_MY_DEPS_INPUT_FILE: entry.input,
      ROAST_MY_DEPS_OUTPUT_FILE: entry.output,
      ROAST_MY_DEPS_TARGET_NAME: entry.name,
      ROAST_MY_DEPS_TARGET_ONLY: entry.kind === 'all' ? 'false' : 'true',
    }),
  });

  let sizes = {};

  if (code === 0) {
    let outputStats = await stat(entry.output);
    let outputStatsGz = await stat(entry.outputGz);

    sizes.outputBytes = outputStats.size;
    sizes.outputBytesGz = outputStatsGz.size;
  }

  return { entry, code, sizes };
}

/*::
export type RoastMyDepsOpts = {
  sourceGlobs?: Array<string>,
  configPath?: string,
  ignore?: Array<string>,
  only?: Array<string>,
  verbose?: boolean,
};
*/

async function roastMyDeps(rootPkgPath /*: string */, opts /*: RoastMyDepsOpts */ = {}) {
  let rootDir = path.dirname(rootPkgPath);
  let sourceGlobs = opts.sourceGlobs && opts.sourceGlobs.length ? opts.sourceGlobs : DEFAULT_SOURCE_GLOBS;
  let configPath = opts.configPath || DEFAULT_CONFIG;
  let ignored = opts.ignore || [];
  let only = opts.only || [];
  let verbose = opts.verbose || false;

  let rootYarnLockPath = path.join(rootDir, 'yarn.lock');
  let rootNodeModulesPath = path.join(rootDir, 'node_modules');
  let rootNodeModulesCacheDir = path.join(rootNodeModulesPath, '.cache');
  let cacheDir = path.join(rootNodeModulesCacheDir, 'roast-my-deps');
  let pkgPath = path.join(cacheDir, 'package.json');

  let isYarn = await exists(rootYarnLockPath);
  let isInstalled = await exists(rootNodeModulesPath);

  if (!isInstalled) {
    throw new Error('Please install your package.json first using Yarn or npm.');
  }

  let pkg = await readPkg(rootPkgPath, { normalize: false });
  let dependencies = pkg.dependencies || {};

  await ensureDir(rootNodeModulesCacheDir);
  await ensureDir(cacheDir);

  await writeFile(pkgPath, JSON.stringify({
    name: 'roast-my-deps',
    dependencies
  }, null, 2));

  let [externalImports,] = await Promise.all([
    getExternalImports(sourceGlobs, rootDir, ignored),
    installDependencies(cacheDir, isYarn, verbose),
  ]);

  let dependencyNames = Object.keys(dependencies);
  let importBuckets = {};
  let safeExternalImports = [];

  externalImports.forEach(importSpecifier => {
    let match = dependencyNames.find(depName => {
      return isDepMatch(depName, importSpecifier);
    });

    if (!match) {
      if (verbose) {
        console.error(`Imported external dependency "${importSpecifier}" but not installed in package.json#dependencies`);
      }
      return;
    }

    importBuckets[match] = importBuckets[match] || [];
    importBuckets[match].push(importSpecifier);
    safeExternalImports.push(importSpecifier);
  });

  let entries = [];

  await Promise.all(Object.keys(importBuckets).map(async depName => {
    let matches = importBuckets[depName] || [];
    let fileContents = matches.map(match => `f(require("${match}"));`).join('\n');
    let entry = await createEntry(cacheDir, 'module', depName, fileContents);

    entries.push(entry);
  }));

  let emptyEntry = await createEntry(cacheDir, 'empty', '_empty', '');
  let emptyResults = await bundleEntry(configPath, cacheDir, emptyEntry, verbose);

  entries.unshift(
    await createEntry(cacheDir, 'all', '_all', safeExternalImports.map(importSpecifier => `f(require("${importSpecifier}"));`).join('\n'))
  );

  let mainPath = path.join(cacheDir, '_main.html');

  await writeFile(
    mainPath,
    entries.map(entry => `<script src="./${path.relative(cacheDir, entry.input)}"></script>`).join('\n')
  );

  let filteredEntries = entries.filter(entry => {
    return only.length ? only.includes(entry.name) : true;
  });

  let results = await Promise.all(filteredEntries.map(async entry => {
    let result = await bundleEntry(configPath, cacheDir, entry, verbose);

    if (result.code === 0) {
      result.sizes.outputBytes = result.sizes.outputBytes - emptyResults.sizes.outputBytes;
      result.sizes.outputBytesGz = result.sizes.outputBytesGz - emptyResults.sizes.outputBytesGz;

      console.log(chalk.bold.bgGreen.white(
        `${result.entry.name}: ${prettyBytes(result.sizes.outputBytes)} min, ${prettyBytes(result.sizes.outputBytesGz)} min+gz`
      ));
    } else {
      console.error(chalk.red(result.entry.name));
    }

    return result;
  }));

  let hasErrors = false;

  let successful = results.filter(res => {
    if (res.code !== 0) {
      hasErrors = true;
      console.error(chalk.red(`Failed to build ${chalk.bold(res.entry.name)}, exited with ${chalk.bold(res.code)}`));
    }
    return res.code === 0;
  });

  if (hasErrors && !verbose) {
    console.error(chalk.red(`\nSome bundles failed to build. Try re-running with ${chalk.bold('--verbose')}\n`));
  }

  let sorted = successful.sort((a, b) => {
    return b.sizes.outputBytesGz - a.sizes.outputBytesGz;
  });

  return sorted;
}

module.exports = roastMyDeps;
