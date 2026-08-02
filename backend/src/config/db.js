function getDbConfig(env){
  const runtimeEnv = env || process.env;
  const config = {
    host: runtimeEnv.DB_HOST || 'localhost',
    user: runtimeEnv.DB_USER || 'root',
    password: runtimeEnv.DB_PASS || '',
    database: runtimeEnv.DB_NAME || 'clue_system',
    port: runtimeEnv.DB_PORT ? parseInt(runtimeEnv.DB_PORT, 10) : 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };

  // 避免 DATETIME 被驱动层时区转换
  config.timezone = runtimeEnv.DB_TIMEZONE || '+08:00';
  // 返回日期字符串，避免隐式时区偏移
  config.dateStrings = true;

  return config;
}

module.exports = {
  getDbConfig,
};
