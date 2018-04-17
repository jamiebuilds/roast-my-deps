// @flow
'use strict';
// const path = require('path');

const ROAST_MY_DEPS_INPUT_FILE = process.env.ROAST_MY_DEPS_INPUT_FILE;
const ROAST_MY_DEPS_TARGET_ONLY = process.env.ROAST_MY_DEPS_TARGET_ONLY;
const ROAST_MY_DEPS_TARGET_NAME = process.env.ROAST_MY_DEPS_TARGET_NAME;

if (!ROAST_MY_DEPS_INPUT_FILE) throw new Error('Missing process.env.ROAST_MY_DEPS_INPUT_FILE');
if (!ROAST_MY_DEPS_TARGET_ONLY) throw new Error('Missing process.env.ROAST_MY_DEPS_TARGET_ONLY');
if (!ROAST_MY_DEPS_TARGET_NAME) throw new Error('Missing process.env.ROAST_MY_DEPS_TARGET_NAME');

module.exports = (id /*: string */) => {
  if (ROAST_MY_DEPS_TARGET_ONLY !== 'true') return false;
  if (id[0] === '.') return false;
  if (id.includes(ROAST_MY_DEPS_INPUT_FILE)) return false;
  if (id.includes(ROAST_MY_DEPS_TARGET_NAME)) return false;
  return true;
};
