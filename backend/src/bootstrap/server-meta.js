function createServerMeta(){
  return {
    SERVER_STARTED_AT: new Date().toISOString(),
  };
}

module.exports = {
  createServerMeta,
};
