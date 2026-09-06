function registerAccessLogMiddleware(ctx){
  const app = ctx.app;
  const accessDebug = ctx.accessDebug;

  // 诊断中间件：记录到达 /api/* 的请求，方便确认隧道是否正确转发到本地
  app.use('/api', (req, _res, next) => {
    try{
      const reqUrl = req.originalUrl || req.url || '';
      if(accessDebug.shouldIgnoreAccessLog(reqUrl)) return next();
      if(accessDebug.shouldSampleSkipAccessLog(reqUrl, Date.now())) return next();

      const info = {
        time: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl || req.url,
        origin: req.headers.origin || '',
        host: req.headers.host || '',
        ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
        authPresent: !!req.headers.authorization,
        ua: (req.headers['user-agent'] || '').slice(0, 200)
      };
      accessDebug.appendAccessLogAsync(JSON.stringify(info));
    }catch(e){
      try{
        accessDebug.appendAccessLogAsync('log_error:' + (e && e.message ? e.message : e));
      }catch(_){ }
    }
    next();
  });
}

module.exports = {
  registerAccessLogMiddleware,
};
