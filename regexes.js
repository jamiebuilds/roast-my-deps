// This file was modified from:
// https://github.com/OctoLinker/OctoLinker/tree/master/packages/helper-grammar-regex-collection
//
// MIT License
// Copyright (c) 2014–present Stefan Buck
//
// @flow
'use strict';

const XRegExp = require('xregexp/lib/xregexp');
const build = require('xregexp/lib/addons/build');

build(XRegExp);

const regex = XRegExp.tag('xngm');

const captureQuotedWord = regex`
  ['"]              # beginning quote
  (?<$1>[^'"\s]+)   # capture the word inside the quotes
  ['"]              # end quote
`;

const captureJsQuotedWord = regex`
  ['"\`]            # beginning quote
  (?<$1>[^'"\`\s]+) # capture the word inside the quotes
  ['"\`]            # end quote
`;

const diffSigns = regex`
  ^[ \t]*[+-]?
`;

const importMembers = regex`[\r\n\s\w{},*\$]*`;
const from = regex`\s from \s`;

const REQUIRE = regex`
  ( require(\.resolve)? | proxyquire | import | require_relative )
  \s* ( \s | \( ) \s*
  ${captureJsQuotedWord}
`;

const IMPORT = regex`
  import \s ${importMembers}
  ${from}?
  ${captureQuotedWord}
`;

const EXPORT = regex`
  export \s ${importMembers}
  ${from}
  ${captureQuotedWord}
`;

module.exports = [REQUIRE, IMPORT, EXPORT];
