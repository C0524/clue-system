function registerGracefulShutdown(ctx){
  const getPool = ctx.getPool;

  async function shutdown(signal){
    console.log(`收到 ${signal}，正在优雅退出...`);
    try{
      const pool = getPool();
      if(pool && typeof pool.end === 'function') await pool.end();
    }catch(e){
      console.warn('关闭 pool 错误', e);
    }
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = {
  registerGracefulShutdown,
};
