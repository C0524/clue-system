function registerImportDebugMiddleware(ctx){
  const app = ctx.app;
  const accessDebug = ctx.accessDebug;

  app.use('/api/importClues', (req, res, next) => {
    expressJson20mb(req, res, (err) => {
      if (err) return next(err);
      return next();
    });
  });

  app.use('/api/importClues', (req, _res, next) => {
    if(!accessDebug.isImportDebugEnabled) return next();
    try{
      const info = {
        time: new Date().toISOString(),
        remote: req.ip || (req.connection && req.connection.remoteAddress) || null,
        hasAuth: !!req.headers.authorization,
        authSample: req.headers.authorization ? (req.headers.authorization + '').slice(0, 100) : null,
        contentLength: req.headers['content-length'] || null
      };
      if(req.body && Array.isArray(req.body.clues)){
        info.cluesCount = req.body.clues.length;
        info.cluesSample = req.body.clues.slice(0, 5).map((c) => ({
          phone: c.phone || '',
          wechat: c.wechat || '',
          doctor: c.doctor || '',
          channel: c.channel || '',
          createTime: c.createTime || ''
        }));
      }
      accessDebug.appendImportDebugAsync(info);
    }catch(e){
      accessDebug.appendImportDebugAsync('log_error:' + (e.message || e));
    }
    next();
  });
}

const express = require('express');
const expressJson20mb = express.json({ limit: '20mb' });

module.exports = {
  registerImportDebugMiddleware,
};
