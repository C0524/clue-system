function setupBaseApp(ctx){
  const app = ctx.app;
  const express = ctx.express;
  const corsPnaMiddleware = ctx.corsPnaMiddleware;

  // 开发时强制本地静态资源和首页不走浏览器缓存，避免旧版本继续被复用
  app.use((req, res, next) => {
    const cacheBusted = req.path === '/' || req.path === '/index.html' || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html');
    if(cacheBusted){
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  // 增加 body-parser 的大小限制，避免大批量导入时出现请求体过大
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(express.static('./'));

  // 不使用默认 cors()，统一通过自定义中间件处理 CORS 与 PNA
  app.use(corsPnaMiddleware);
}

module.exports = {
  setupBaseApp,
};
