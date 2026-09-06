function createStartServer(ctx){
  const app = ctx.app;
  const defaultPort = ctx.defaultPort;
  const dbInitPromise = ctx.dbInitPromise;
  const prewarmCachesOnStart = ctx.prewarmCachesOnStart;
  const query = ctx.query;
  const env = ctx.env || process.env;

  let serverInstance = null;

  return async function startServer(port){
    if(serverInstance) return serverInstance;
    await dbInitPromise;
    const finalPort = Number(port) > 0 ? Number(port) : defaultPort;
    serverInstance = app.listen(finalPort, () => {
      console.log(`服务已启动： http://localhost:${finalPort}`);
      // 后台异步预热，不阻塞服务对外提供能力。
      setTimeout(() => { prewarmCachesOnStart({ query, env }); }, 500);
    });
    return serverInstance;
  };
}

module.exports = {
  createStartServer,
};
