const { registerAuthUsersRoutes } = require('../modules/auth-users/routes');
const { registerDoctorRoutes } = require('../modules/doctors/routes');
const { registerTaoRenRoutes } = require('../modules/taoren/routes');
const { registerLogRoutes } = require('../modules/logs/routes');
const { registerVisitRoutes } = require('../modules/visits/routes');
const { registerCluesQueryRoutes } = require('../modules/clues-query/routes');
const { registerCluesWriteRoutes } = require('../modules/clues-write/routes');
const { registerCluesIoRoutes } = require('../modules/clues-io/routes');
const { registerStatsRoutes } = require('../modules/stats/routes');
const { registerDebugRoutes } = require('../modules/debug/routes');
const { registerImageRoutes } = require('../modules/images/routes');
const { registerSystemRoutes } = require('../modules/system/routes');

function registerBackendRoutes(ctx){
  const {
    app,
    query,
    execute,
    addLog,
    nowStr,
    createAuthToken,
    authMiddleware,
    adminOnly,
    computeExpired,
    computeExpiredAsync,
    createS3Client,
    DeleteObjectCommand,
    getPool,
    appendImportDebugAsync,
    excelSerialToDateString,
    getR2BucketName,
    getR2PublicDomain,
    buildR2ObjectUrl,
    ENABLE_DEBUG_ROUTES,
    ALLOWED_CLUE_UPDATE_KEYS,
    SERVER_STARTED_AT,
  } = ctx;

  registerSystemRoutes({
    app,
    serverStartedAt: SERVER_STARTED_AT,
  });

  registerAuthUsersRoutes({
    app,
    query,
    execute,
    addLog,
    createAuthToken,
    authMiddleware,
    adminOnly,
  });

  registerDoctorRoutes({
    app,
    query,
    execute,
    addLog,
    authMiddleware,
    adminOnly,
  });

  registerTaoRenRoutes({
    app,
    query,
    execute,
    addLog,
    authMiddleware,
    adminOnly,
  });

  registerLogRoutes({
    app,
    query,
    authMiddleware,
    adminOnly,
  });

  registerVisitRoutes({
    app,
    query,
    execute,
    addLog,
    nowStr,
    authMiddleware,
  });

  registerCluesQueryRoutes({
    app,
    query,
    authMiddleware,
    computeExpired,
  });

  registerCluesWriteRoutes({
    app,
    query,
    execute,
    addLog,
    nowStr,
    authMiddleware,
    ALLOWED_CLUE_UPDATE_KEYS,
  });

  registerCluesIoRoutes({
    app,
    query,
    execute,
    addLog,
    nowStr,
    authMiddleware,
    computeExpiredAsync,
    createS3Client,
    DeleteObjectCommand,
    getPool,
    appendImportDebugAsync,
    excelSerialToDateString,
  });

  registerImageRoutes({
    app,
    query,
    execute,
    addLog,
    authMiddleware,
    adminOnly,
    createS3Client,
    getR2BucketName,
    getR2PublicDomain,
    buildR2ObjectUrl,
  });

  registerStatsRoutes({
    app,
    query,
    nowStr,
    authMiddleware,
    ENABLE_DEBUG_ROUTES,
  });

  registerDebugRoutes({
    app,
    query,
    authMiddleware,
    adminOnly,
    ENABLE_DEBUG_ROUTES,
  });
}

module.exports = {
  registerBackendRoutes,
};
