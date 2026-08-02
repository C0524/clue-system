function padNumber(n){
  return n < 10 ? ('0' + n) : ('' + n);
}

function nowStr(){
  const d = new Date();
  return d.getFullYear() + '-' + padNumber(d.getMonth() + 1) + '-' + padNumber(d.getDate()) + ' ' + padNumber(d.getHours()) + ':' + padNumber(d.getMinutes()) + ':' + padNumber(d.getSeconds());
}

module.exports = {
  nowStr,
};
