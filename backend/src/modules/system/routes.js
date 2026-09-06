function registerSystemRoutes(ctx){
  const app = ctx.app;
  const serverStartedAt = ctx.serverStartedAt;

  // 健康检查路由：用于远端验证 ingress 是否正确转发到本地
  app.get('/api/_health', (_req, res) => {
    res.json({ code: 200, data: 'ok' });
  });

  // 服务版本/启动时间接口：前端可轮询此接口以检测后端重启
  app.get('/api/server-version', (_req, res) => {
    try{
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }catch(_){ }
    res.json({ code: 200, data: { startedAt: serverStartedAt } });
  });
}

module.exports = {
  registerSystemRoutes,
};
