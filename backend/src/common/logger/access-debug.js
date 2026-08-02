const fs = require('fs');
const os = require('os');
const path = require('path');

function parsePaths(raw, fallback){
  return (raw || fallback)
    .split(',')
    .map(s => (s || '').trim())
    .filter(Boolean);
}

function createAccessDebugLogger(options){
  const baseDir = options && options.baseDir ? options.baseDir : process.cwd();
  const env = options && options.env ? options.env : process.env;

  const accessLogFile = path.join(baseDir, 'access_debug.log');
  const accessLogMaxMb = Number(env.ACCESS_LOG_MAX_MB || 10);
  const accessLogMaxBytes = Number.isFinite(accessLogMaxMb) && accessLogMaxMb > 0
    ? Math.floor(accessLogMaxMb * 1024 * 1024)
    : 10 * 1024 * 1024;
  const accessLogSampleWindowMs = Number(env.ACCESS_LOG_SAMPLE_WINDOW_MS || 10000);
  const accessLogIgnorePaths = parsePaths(env.ACCESS_LOG_IGNORE_PATHS, '/api/server-version');
  const accessLogSampledPaths = parsePaths(env.ACCESS_LOG_SAMPLED_PATHS, '/api/server-version');

  const importDebugEnabled = env.ENABLE_IMPORT_DEBUG_LOG === '1';
  const importDebugFile = path.join(baseDir, 'import_debug.log');

  const lastWriteTsByPath = new Map();

  function shouldIgnoreAccessLog(url){
    return accessLogIgnorePaths.some(p => p && url.includes(p));
  }

  function shouldSampleSkipAccessLog(url, nowMs){
    const matched = accessLogSampledPaths.find(p => p && url.includes(p));
    if(!matched) return false;
    const last = lastWriteTsByPath.get(matched) || 0;
    if(nowMs - last < accessLogSampleWindowMs) return true;
    lastWriteTsByPath.set(matched, nowMs);
    return false;
  }

  function rotateAccessLogIfNeeded(){
    try{
      if(!fs.existsSync(accessLogFile)) return;
      const st = fs.statSync(accessLogFile);
      if(!st || st.size < accessLogMaxBytes) return;
      const rotated = accessLogFile + '.1';
      try{ if(fs.existsSync(rotated)) fs.unlinkSync(rotated); }catch(_){ }
      fs.renameSync(accessLogFile, rotated);
    }catch(_){ }
  }

  function appendAccessLogAsync(line){
    rotateAccessLogIfNeeded();
    fs.appendFile(accessLogFile, line + os.EOL, (err) => {
      if(err){
        try{ fs.appendFile(accessLogFile, 'log_error:' + (err && err.message ? err.message : err) + os.EOL, () => {}); }catch(_){ }
      }
    });
  }

  function appendImportDebugAsync(entry){
    if(!importDebugEnabled) return;
    const line = typeof entry === 'string' ? entry : JSON.stringify(entry);
    fs.appendFile(importDebugFile, line + os.EOL, () => {});
  }

  return {
    isImportDebugEnabled: importDebugEnabled,
    shouldIgnoreAccessLog,
    shouldSampleSkipAccessLog,
    appendAccessLogAsync,
    appendImportDebugAsync,
  };
}

module.exports = {
  createAccessDebugLogger,
};
