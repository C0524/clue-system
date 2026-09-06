function createAddLog(ctx){
  const execute = ctx.execute;
  const nowStr = ctx.nowStr;

  return async function addLog(user, text){
    try{
      await execute('INSERT INTO logs (`time`, `user`, `text`) VALUES (?,?,?)', [nowStr(), user, text]);
    }catch(e){
      console.error('addLog error', e);
    }
  };
}

module.exports = {
  createAddLog,
};
