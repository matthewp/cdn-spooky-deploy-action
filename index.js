const core = require('@actions/core');
const github = require('@actions/github');
const S3 = require('aws-sdk/clients/s3');
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
const klawSync = require('klaw-sync');
const { lookup } = require('mime-types');

const SPOOKY_BUCKET = 'cdn.spooky.click';

const BUCKET = core.getInput('host') || SPOOKY_BUCKET;

const AWS_KEY_ID = core.getInput('key_id', {
  required: true
});
const SECRET_ACCESS_KEY = core.getInput('access_key', {
  required: true
});

const SOURCE_DIR = core.getInput('source', {
  required: true
});

const PKG_NAME = core.getInput('pkg', {
  required: true
});

const VERSION = github.context.ref.replace(/refs\/tags\/(v*)/, "");

const DESTINATION_DIR = path.join(PKG_NAME, VERSION);
const INFO_FILE = path.join(PKG_NAME, "info.json");

const s3 = new S3({
  accessKeyId: AWS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY
});
const destinationDir = DESTINATION_DIR === '/' ? shortid() : DESTINATION_DIR;
const paths = klawSync(SOURCE_DIR, {
  nodir: true
});

function updateInfo() {
  return new Promise((resolve, reject) => {
    s3.getObject({
      Bucket: BUCKET,
      Key: INFO_FILE
    }, (err, data) => {
      let info;
      if(err) {
        if(err.code === 'NoSuchKey') {
          info = { tags: {}, versions: [] };
        } else {
          reject(err);
          return;
        }
      } else {
        let json = data.Body.toString('utf-8');
        info = JSON.parse(json);
      }
      info.tags.latest = VERSION;
      const versions = new Set(info.versions);
      versions.add(VERSION);
      info.versions = Array.from(versions);
      s3.putObject({
        Body: JSON.stringify(info),
        Bucket: BUCKET,
        Key: INFO_FILE,
        ContentType: 'application/json'
      }, (err) => {
        if(err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  })
}

function upload(params) {
  return new Promise((resolve, reject) => {
    s3.upload(params, (err, data) => {
      if (err) {
        core.error(err);
        return reject(err);
      }
      core.info(`uploaded - ${data.Key}`);
      core.info(`located - ${data.Location}`);
      resolve(data.Location);
    });
  });
}

function run() {
  const sourceDir = path.join(process.cwd(), SOURCE_DIR);
  let fileUploads = Promise.all(
    paths.map(p => {
      const fileStream = fs.createReadStream(p.path);
      const bucketPath = path.join(destinationDir, path.relative(sourceDir, p.path));
      const params = {
        Bucket: BUCKET,
        Body: fileStream,
        Key: bucketPath,
        CacheControl: 'public,max-age=31536000,immutable',
        ContentType: lookup(p.path) || 'text/plain'
      };
      return upload(params);
    })
  );
  let infoUpdate = updateInfo();
  return Promise.all([fileUploads, infoUpdate]);
}

run()
  .then(locations => {
    core.info(`object key - ${destinationDir}`);
    core.info(`object locations - ${locations}`);
  })
  .catch(err => {
    core.error(err);
    core.setFailed(err.message);
  });