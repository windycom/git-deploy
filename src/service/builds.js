'use strict';

/**
 * @module service/builds
 * @author Arne Seib <arne.seib@windy.com>
 * Static files: Actual build results.
 */

const express = require('express');
const { config } = require('lib/config');

//------------------------------------------------------------------------------
// Module init.
module.exports = () => express.static(config.wwwPath);
