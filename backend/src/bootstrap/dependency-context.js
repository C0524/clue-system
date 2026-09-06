function createDbInitDeps(ctx){
  return {
    mysql: ctx.mysql,
    dbConfig: ctx.dbConfig,
    setPool: ctx.setPool,
    query: ctx.query,
    execute: ctx.execute,
    runStartupDbMigrations: ctx.runStartupDbMigrations,
    ensureCluesExpiredCols: ctx.ensureCluesExpiredCols,
    backfillBookedClueTimesFromLogs: ctx.backfillBookedClueTimesFromLogs,
  };
}

function createRouteDeps(ctx){
  return {
    app: ctx.app,
    query: ctx.query,
    execute: ctx.execute,
    addLog: ctx.addLog,
    nowStr: ctx.nowStr,
    createAuthToken: ctx.createAuthToken,
    authMiddleware: ctx.authMiddleware,
    adminOnly: ctx.adminOnly,
    computeExpired: ctx.computeExpired,
    computeExpiredAsync: ctx.computeExpiredAsync,
    createS3Client: ctx.createS3Client,
    DeleteObjectCommand: ctx.DeleteObjectCommand,
    getPool: ctx.getPool,
    appendImportDebugAsync: ctx.appendImportDebugAsync,
    excelSerialToDateString: ctx.excelSerialToDateString,
    getR2BucketName: ctx.getR2BucketName,
    getR2PublicDomain: ctx.getR2PublicDomain,
    buildR2ObjectUrl: ctx.buildR2ObjectUrl,
    ENABLE_DEBUG_ROUTES: ctx.ENABLE_DEBUG_ROUTES,
    SERVER_STARTED_AT: ctx.SERVER_STARTED_AT,
    ALLOWED_CLUE_UPDATE_KEYS: ctx.ALLOWED_CLUE_UPDATE_KEYS,
  };
}

module.exports = {
  createDbInitDeps,
  createRouteDeps,
};
