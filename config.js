// @flow
'use strict';
const nodeResolve = require('rollup-plugin-node-resolve');
const nodeGlobals = require('rollup-plugin-node-globals');
const nodeBuiltins = require('rollup-plugin-node-builtins');
const commonjs = require('rollup-plugin-commonjs');
const alias = require('rollup-plugin-alias');
const uglify = require('rollup-plugin-uglify');
const replace = require('rollup-plugin-replace');
const gzip = require('rollup-plugin-gzip');
const json = require('rollup-plugin-json');
const external = require('./external');

const ROAST_MY_DEPS_INPUT_FILE = process.env.ROAST_MY_DEPS_INPUT_FILE;
const ROAST_MY_DEPS_OUTPUT_FILE = process.env.ROAST_MY_DEPS_OUTPUT_FILE;

if (!ROAST_MY_DEPS_INPUT_FILE) throw new Error('Missing process.env.ROAST_MY_DEPS_INPUT_FILE');
if (!ROAST_MY_DEPS_OUTPUT_FILE) throw new Error('Missing process.env.ROAST_MY_DEPS_OUTPUT_FILE');

const NODE_MODULES = `node_modules/.cache/roast-my-deps/node_modules`;

// we must do this because the React libraries use object properties
// to export things, see this for more information:
// https://github.com/rollup/rollup-plugin-commonjs#custom-named-exports
const namedExports = {
  [`${NODE_MODULES}/react/index.js`]: [
    'Children', 'Component', 'PureComponent', 'createElement', 'cloneElement',
    'isValidElement', 'createFactory', 'version', 'Fragment'
  ],
  [`${NODE_MODULES}/react-dom/index.js`]: [
    'findDOMNode', 'render', 'unmountComponentAtNode', 'version'
  ]
};

module.exports = {
  input: ROAST_MY_DEPS_INPUT_FILE,
  output: {
    file: ROAST_MY_DEPS_OUTPUT_FILE,
    format: 'cjs',
    sourcemap: true,
  },
  external,
  plugins: [
    nodeResolve({
      preferBuiltins: false,
    }),
    // nodeGlobals(),
    nodeBuiltins(),
    commonjs({ namedExports }),
    replace({
      'process.env.NODE_ENV': '"production"',
    }),
    uglify({
      mangle: {
        toplevel: true
      },
    }),
    gzip({
      algorithm: 'zopfli',
      options: {
        numiterations: 10
      }
    }),
    json(),
  ]
};
