require('dotenv').config();
const mysql = require('mysql2/promise');

function toTime(v) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

function recTime(c) {
  if (c && c.visitDate) {
    const s = String(c.visitDate);
    return toTime(s.includes(':') ? s : s + ' 00:00:00');
  }
  return toTime(c && c.createTime);
}

function isRevisit(c) {
  return !!(c.revisitGroupId && String(c.revisitGroupId).trim() !== '');
}

function isArrive(c) {
  const a = String(c.arrive || '').trim();
  return a === '已到诊' || a === '已到院';
}

function hasVisitDateInJune(c, mn, me) {
  if (!c || !c.visitDate) return false;
  const s = String(c.visitDate);
  const t = toTime(s.includes(':') ? s : s + ' 00:00:00');
  return t >= mn && t < me;
}

(async () => {
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'clue_system',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    charset: 'utf8mb4',
  };

  const conn = await mysql.createConnection(cfg);
  const [rows] = await conn.query(
    'SELECT id,name,phone,wechat,doctor,regDoctor,book,arrive,revisitGroupId,createTime,visitDate,bookUser,channel,visitMode FROM clues'
  );

  const mn = new Date(2026, 5, 1).getTime();
  const me = new Date(2026, 6, 1).getTime();
  const prevStart = new Date(2026, 4, 1).getTime();
  const prevEnd = mn;

  const monthBookSet = new Set();
  for (const c of rows) {
    const createTs = toTime(c.createTime);
    const booked = String(c.book || '').trim() === '已预约';
    if (!booked) continue;

    if (!isRevisit(c)) {
      if (
        ((createTs >= mn && createTs < me) || (createTs >= prevStart && createTs < prevEnd)) &&
        hasVisitDateInJune(c, mn, me)
      ) {
        monthBookSet.add(String(c.id));
      }
    } else {
      const rt = recTime(c);
      if (
        ((createTs >= mn && createTs < me) || (createTs >= prevStart && createTs < prevEnd)) &&
        rt >= mn &&
        rt < me
      ) {
        monthBookSet.add(String(c.id));
      }
    }
  }

  const monthArriveRows = rows.filter((c) => {
    const t = recTime(c);
    return t >= mn && t < me && isArrive(c);
  });

  const monthArriveSet = new Set(monthArriveRows.map((c) => String(c.id)));
  const extraArrive = monthArriveRows.filter((c) => !monthBookSet.has(String(c.id)));

  console.log('monthBook=', monthBookSet.size, 'monthArrive=', monthArriveSet.size, 'diff=', monthArriveSet.size - monthBookSet.size);
  console.log('arrive_but_not_book_count=', extraArrive.length);
  for (const c of extraArrive) {
    const out = {
      id: c.id,
      name: c.name,
      phone: c.phone,
      wechat: c.wechat,
      doctor: c.regDoctor || c.doctor || '',
      book: c.book,
      arrive: c.arrive,
      visitDate: c.visitDate,
      createTime: c.createTime,
      bookUser: c.bookUser,
      channel: c.channel,
      visitMode: c.visitMode,
      revisitGroupId: c.revisitGroupId || '',
    };
    console.log(JSON.stringify(out, null, 2));
  }

  await conn.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
