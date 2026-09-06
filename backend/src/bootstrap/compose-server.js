const express = require('express');
const mysql = require('mysql2/promise');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

const { createAuthToken, verifyAuthToken } = require('../common/auth-token');
const { corsPnaMiddleware } = require('../common/cors-pna');
const { createAuthMiddleware, adminOnly } = require('../common/auth-middleware');
const { createAccessDebugLogger } = require('../common/logger/access-debug');
const { createS3Client, getR2BucketName, getR2PublicDomain, buildR2ObjectUrl } = require('../common/storage/r2');
const { nowStr } = require('../common/utils/time');
const { computeExpired } = require('../common/utils/expired');
const { ALLOWED_CLUE_UPDATE_KEYS } = require('../common/constants/clue-update-keys');
const { createAddLog } = require('../common/services/add-log');
const { createComputeExpiredAsync } = require('../common/services/clue-expired');
const { excelSerialToDateString } = require('../common/utils/excel');

const { getDbConfig } = require('../config/db');
const { resolveRuntimeConfig } = require('../config/runtime');

const { setupBaseApp } = require('./app-setup');
const { registerAccessLogMiddleware } = require('./access-log-middleware');
const { runStartupDbMigrations, ensureCluesExpiredCols } = require('./db-init');
const { createBackfillBookedClueTimesFromLogs } = require('./booktime-backfill');
const { createDbRuntime } = require('./db-runtime');
const { initDatabase } = require('./db-pool-init');
const { createDbInitDeps, createRouteDeps } = require('./dependency-context');
const { createServerMeta } = require('./server-meta');
const { createStartServer } = require('./start-server');
const { registerImportDebugMiddleware } = require('./import-debug-middleware');
const { prewarmCachesOnStart } = require('./prewarm');
const { registerBackendRoutes } = require('./register-routes');
const { registerGracefulShutdown } = require('./shutdown');

function composeServer(ctx){
  const env = ctx && ctx.env ? ctx.env : process.env;
  const baseDir = ctx && ctx.baseDir ? ctx.baseDir : process.cwd();

  const runtimeConfig = resolveRuntimeConfig(env);
  const accessDebug = createAccessDebugLogger({ baseDir, env });

  const app = express();
  setupBaseApp({ app, express, corsPnaMiddleware });
  registerAccessLogMiddleware({ app, accessDebug });

  const { SERVER_STARTED_AT } = createServerMeta();
  registerImportDebugMiddleware({ app, accessDebug });

  const dbConfig = getDbConfig(env);
  const dbRuntime = createDbRuntime();
  const query = dbRuntime.query;
  const execute = dbRuntime.execute;
  const getPool = dbRuntime.getPool;

  const computeExpiredAsync = createComputeExpiredAsync({ query, computeExpired });
  const authMiddleware = createAuthMiddleware({ query, verifyAuthToken });
  const addLog = createAddLog({ execute, nowStr });
  const backfillBookedClueTimesFromLogs = createBackfillBookedClueTimesFromLogs({ query, execute, nowStr });

  const dbInitPromise = initDatabase(createDbInitDeps({
    mysql,
    dbConfig,
    setPool: dbRuntime.setPool,
    query,
    execute,
    runStartupDbMigrations,
    ensureCluesExpiredCols,
    backfillBookedClueTimesFromLogs,
  }));

  registerBackendRoutes(createRouteDeps({
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
    appendImportDebugAsync: accessDebug.appendImportDebugAsync,
    excelSerialToDateString,
    getR2BucketName,
    getR2PublicDomain,
    buildR2ObjectUrl,
    ENABLE_DEBUG_ROUTES: runtimeConfig.ENABLE_DEBUG_ROUTES,
    SERVER_STARTED_AT,
    ALLOWED_CLUE_UPDATE_KEYS,
  }));

  const startServer = createStartServer({
    app,
    defaultPort: runtimeConfig.PORT,
    dbInitPromise,
    prewarmCachesOnStart,
    query,
    env,
  });

  registerGracefulShutdown({ getPool });

  return {
    app,
    startServer,
    defaultPort: runtimeConfig.PORT,
  };
}

module.exports = {
  composeServer,
};
