const multer = require('multer');
const sharp = require('sharp');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

function registerImageRoutes(deps){
  const app = deps.app;
  const query = deps.query;
  const execute = deps.execute;
  const addLog = deps.addLog;
  const authMiddleware = deps.authMiddleware;
  const adminOnly = deps.adminOnly;
  const createS3Client = deps.createS3Client;
  const getR2BucketName = deps.getR2BucketName;
  const getR2PublicDomain = deps.getR2PublicDomain;
  const buildR2ObjectUrl = deps.buildR2ObjectUrl;

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  app.post('/api/uploadImage', authMiddleware, upload.single('image'), async (req, res) => {
    try{
      if(!req.file) return res.status(400).json({ code:400, msg: '没有上传文件' });
      const file = req.file;
      const originalName = String(file.originalname || 'image').replace(/[\\/\r\n\t]+/g, '_');
      const storageName = originalName;
      const s3 = createS3Client(process.env);
      const bucket = getR2BucketName(process.env);
      const publicDomain = getR2PublicDomain(process.env);
      if(!s3 || !bucket || !publicDomain) return res.status(500).json({ code:500, msg: 'R2 未配置，无法上传' });
      const baseKey = `clue_images/${Date.now()}_${Math.random().toString(36).slice(2,8)}_${storageName}`;

      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: baseKey, Body: file.buffer, ContentType: file.mimetype }));

      const url = buildR2ObjectUrl(publicDomain, bucket, baseKey);
      const providedClueId = req.query && req.query.clueId ? req.query.clueId : null;
      const providedVisitId = req.query && req.query.visitId ? req.query.visitId : null;
      let insertId = null;
      try{
        const r = await execute('INSERT INTO clue_images (clueId, visitId, url, `key`, filename, uploadedBy, uploadedAt) VALUES (?, ?, ?, ?, ?, ?, NOW())', [providedClueId, providedVisitId || null, url, baseKey, originalName, req.user.username]);
        insertId = r && r.insertId ? r.insertId : null;
      }catch(e){
        console.warn('save image meta failed', e && e.message);
      }

      res.json({ code:200, data: { id: insertId, url, key: baseKey, clueId: providedClueId } });

      (async () => {
        try{
          const smallThumbBuffer = await sharp(file.buffer).resize({ width: 300, withoutEnlargement: true }).toBuffer();
          const smallThumbKey = `clue_images/thumb_small_${Date.now()}_${Math.random().toString(36).slice(2,8)}_${storageName}`;
          await s3.send(new PutObjectCommand({ Bucket: bucket, Key: smallThumbKey, Body: smallThumbBuffer, ContentType: file.mimetype }));
          const thumbSmallUrl = buildR2ObjectUrl(publicDomain, bucket, smallThumbKey);
          if(insertId){
            try{
              await execute('UPDATE clue_images SET thumbSmallKey = ?, thumbSmallUrl = ? WHERE id = ?', [smallThumbKey, thumbSmallUrl, insertId]);
            }catch(e){
              console.warn('persist thumb meta failed', e && e.message);
            }
          }
        }catch(bgErr){
          console.warn('background thumbnail generation/upload failed', bgErr && bgErr.message);
        }
      })();

      return;
    }catch(e){
      console.error('uploadImage error', e);
      return res.status(500).json({ code:500, msg: '上传失败' });
    }
  });

  app.get('/api/clueImages', authMiddleware, async (req, res) => {
    try{
      try{
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }catch(_){ }
      const clueId = req.query.clueId;
      if(!clueId) return res.json({ code:200, data: [] });
      const rows = await query('SELECT id, clueId, visitId, url, `key`, filename, uploadedBy, uploadedAt, thumbSmallKey, thumbSmallUrl FROM clue_images WHERE clueId = ? ORDER BY uploadedAt ASC', [clueId]);
      res.json({ code:200, data: rows });
    }catch(e){
      console.error('clueImages error', e);
      res.json({ code:500, msg:'查询失败' });
    }
  });

  app.post('/api/deleteImage', authMiddleware, async (req, res) => {
    try{
      const body = req.body || {};
      const id = body.id || null;
      if(!id) return res.status(400).json({ code:400, msg: '缺少 image id' });
      const rows = await query('SELECT id, `key`, thumbSmallKey FROM clue_images WHERE id = ? LIMIT 1', [id]);
      if(!rows || rows.length === 0) return res.json({ code:404, msg: '图片未找到' });
      const row = rows[0];
      const s3 = createS3Client(process.env);
      const bucket = getR2BucketName(process.env);
      try{
        if(s3 && bucket && row.key){
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: row.key }));
        }
        if(s3 && bucket && row.thumbSmallKey){
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: row.thumbSmallKey }));
        }
      }catch(delErr){
        console.warn('delete image from r2 failed', delErr && delErr.message);
      }
      try{
        await execute('DELETE FROM clue_images WHERE id = ?', [id]);
      }catch(dbErr){
        console.warn('delete image record failed', dbErr && dbErr.message);
      }
      await addLog(req.user.username, `删除图片 id=${id}`);
      return res.json({ code:200, msg: '删除成功' });
    }catch(e){
      console.error('deleteImage error', e);
      return res.status(500).json({ code:500, msg: '删除失败' });
    }
  });

  app.get('/api/image', async (req, res) => {
    try{
      const key = req.query.key;
      if(!key) return res.status(400).send('missing key');
      if(!key.startsWith('clue_images/')) return res.status(403).send('forbidden');

      const s3 = createS3Client(process.env);
      const bucket = getR2BucketName(process.env);
      if(!s3 || !bucket) return res.status(500).send('R2 not configured');

      const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      const obj = await s3.send(cmd);
      const contentType = obj.ContentType || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      const stream = obj.Body;
      stream.pipe(res);
    }catch(e){
      console.error('image proxy error', e && e.code ? e.code : e);
      if(e && (e.Code === 'NoSuchKey' || e.$metadata && e.$metadata.httpStatusCode === 404)){
        return res.status(404).send('Not Found');
      }
      return res.status(500).send('error');
    }
  });

  app.get('/api/admin/unassociatedImages', authMiddleware, adminOnly, async (req, res) => {
    try{
      const rows = await query('SELECT id, url, `key`, filename, uploadedBy, uploadedAt, thumbSmallKey, thumbSmallUrl FROM clue_images WHERE clueId IS NULL ORDER BY uploadedAt DESC LIMIT 200');
      res.json({ code:200, data: rows });
    }catch(e){
      console.error('unassociatedImages error', e);
      res.json({ code:500, msg: '查询失败' });
    }
  });

  app.post('/api/admin/associateImages', authMiddleware, async (req, res) => {
    try{
      if(!(req.user && req.user.role === '超级管理员')) return res.status(403).json({ code:403, msg: '仅超级管理员可执行' });
      const { clueId, keys } = req.body || {};
      if(!clueId || !Array.isArray(keys) || keys.length === 0) return res.status(400).json({ code:400, msg: '参数不完整' });
      const placeholders = keys.map(() => '?').join(',');
      const sql = 'UPDATE clue_images SET clueId = ? WHERE `key` IN (' + placeholders + ')';
      const params = [clueId].concat(keys);
      const result = await execute(sql, params);
      await addLog(req.user.username, `关联图片到线索 ${clueId}，keys=${keys.slice(0,10).join(',')}`);
      res.json({ code:200, data: { affectedRows: result.affectedRows || 0 } });
    }catch(e){
      console.error('associateImages error', e);
      res.json({ code:500, msg: '关联失败' });
    }
  });

  app.post('/api/associateImagesToVisit', authMiddleware, async (req, res) => {
    try{
      const { visitId, keys } = req.body || {};
      if(!visitId || !Array.isArray(keys) || keys.length === 0) return res.status(400).json({ code:400, msg: '参数不完整' });
      const rows = await query('SELECT id, clueId FROM visits WHERE id = ?', [visitId]);
      if(!rows || rows.length === 0) return res.status(404).json({ code:404, msg: 'visit 未找到' });
      const clueId = rows[0].clueId;
      const placeholders = keys.map(() => '?').join(',');
      const sql = 'UPDATE clue_images SET visitId = ?, clueId = IFNULL(clueId, ?) WHERE `key` IN (' + placeholders + ')';
      const params = [visitId, clueId].concat(keys);
      const result = await execute(sql, params);
      await addLog(req.user.username, `关联图片到回访 ${visitId}，keys=${keys.slice(0,10).join(',')}`);
      res.json({ code:200, data: { affectedRows: result.affectedRows || 0 } });
    }catch(e){
      console.error('associateImagesToVisit error', e);
      res.json({ code:500, msg: '关联图片到回访失败' });
    }
  });
}

module.exports = {
  registerImageRoutes,
};
