const { S3Client } = require('@aws-sdk/client-s3');

function createS3Client(env){
  const runtimeEnv = env || process.env;
  const accountId = runtimeEnv.R2_ACCOUNT_ID;
  const accessKeyId = runtimeEnv.R2_ACCESS_KEY_ID;
  const secretAccessKey = runtimeEnv.R2_SECRET_ACCESS_KEY;

  if(!accountId || !accessKeyId || !secretAccessKey) return null;

  const endpoint = runtimeEnv.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getR2BucketName(env){
  const runtimeEnv = env || process.env;
  return runtimeEnv.R2_BUCKET_NAME || '';
}

function getR2PublicDomain(env){
  const runtimeEnv = env || process.env;
  if(runtimeEnv.R2_PUBLIC_DOMAIN) return runtimeEnv.R2_PUBLIC_DOMAIN;
  if(runtimeEnv.R2_ACCOUNT_ID) return `https://${runtimeEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return '';
}

function buildR2ObjectUrl(publicDomain, bucket, key){
  if(!publicDomain || !bucket || !key) return '';
  return publicDomain.replace(/\/$/, '') + '/' + bucket + '/' + key;
}

module.exports = {
  createS3Client,
  getR2BucketName,
  getR2PublicDomain,
  buildR2ObjectUrl,
};
