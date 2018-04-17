// @flow
'use strict';
const path = require('path');
const webpack = require('webpack');
const CompressionPlugin = require('compression-webpack-plugin');
const external = require('./external');

const ROAST_MY_DEPS_INPUT_FILE = process.env.ROAST_MY_DEPS_INPUT_FILE;
const ROAST_MY_DEPS_OUTPUT_FILE = process.env.ROAST_MY_DEPS_OUTPUT_FILE;

if (!ROAST_MY_DEPS_INPUT_FILE) throw new Error('Missing process.env.ROAST_MY_DEPS_INPUT_FILE');
if (!ROAST_MY_DEPS_OUTPUT_FILE) throw new Error('Missing process.env.ROAST_MY_DEPS_OUTPUT_FILE');

module.exports = {
  mode: 'production',
  entry: ROAST_MY_DEPS_INPUT_FILE,
  output: {
    path: path.dirname(ROAST_MY_DEPS_OUTPUT_FILE),
    filename: path.basename(ROAST_MY_DEPS_OUTPUT_FILE),
  },
  plugins: [
    new CompressionPlugin(),
  ],
  externals: [
    (context, request, callback) => {
      if (external(request)) {
        callback(null, 'commonjs ' + request);
        return;
      }
      callback();
    },
  ],
};
