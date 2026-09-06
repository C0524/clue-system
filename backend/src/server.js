const serverSingleton = require('./bootstrap/server-singleton');

serverSingleton.startServer(process.env.PORT).catch((e) => {
	console.error('backend/src/server start failed', e);
	process.exit(1);
});
