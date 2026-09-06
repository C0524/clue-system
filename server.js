require('dotenv').config();
const { app, startServer, defaultPort } = require('./backend/src/bootstrap/server-singleton');

if (require.main === module) {
  startServer(defaultPort).catch((e) => {
    console.error('startServer failed', e);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
};
