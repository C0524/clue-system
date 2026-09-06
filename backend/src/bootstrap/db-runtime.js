function createDbRuntime(){
  let pool = null;

  function setPool(nextPool){
    pool = nextPool;
  }

  function getPool(){
    return pool;
  }

  async function query(sql, params){
    const [rows] = await pool.query(sql, params);
    return rows;
  }

  async function execute(sql, params){
    const [res] = await pool.execute(sql, params);
    return res;
  }

  return {
    setPool,
    getPool,
    query,
    execute,
  };
}

module.exports = {
  createDbRuntime,
};
