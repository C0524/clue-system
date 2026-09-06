const path = require('path');
const { composeServer } = require('./compose-server');

const singleton = composeServer({
  env: process.env,
  baseDir: path.resolve(__dirname, '../../..'),
});

module.exports = singleton;
