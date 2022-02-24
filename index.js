const core = require('@actions/core');
const github = require('@actions/github');
const S3 = require('aws-sdk/clients/s3');
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
const klawSync = require('klaw-sync');
const { lookup } = require('mime-types');
const zlib = require('zlib');

const SPOOKY_BUCKET = 'cdn.spooky.click';
const HOST = core.getInput('host') || SPOOKY_BUCKET;

const BUCKET = HOST;

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

const SYMLINK = core.getInput('symlink', {
  required: false
});

const ENTRY_MODULE = core.getInput('entry_module', {
  required: false
});

if(SYMLINK && !ENTRY_MODULE) {
  throw new Error('An entry_module must be provided to create a version symlink.');
}

const VERSION = core.getInput('version') ||
  github.context.ref.replace(/refs\/tags\/(v*)/, "");

const DESTINATION_DIR = path.join(PKG_NAME, VERSION);
const INFO_FILE = path.join(PKG_NAME, "info.json");

const VERSION_EXPRESSION = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/;

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

function updateSymlink() {
  return new Promise((resolve, reject) => {
    let match = VERSION_EXPRESSION.exec(VERSION);
    if(match) {
      let [,major] = match;
      let file = `v${major}`;
      let content = `export * from 'https://${HOST}/${DESTINATION_DIR}/${ENTRY_MODULE}';
      import * as mod from 'https://${HOST}/${DESTINATION_DIR}/${ENTRY_MODULE}';
      export default mod.default || null;`
      let key = path.join(PKG_NAME, file);
      s3.putObject({
        Body: content,
        Bucket: BUCKET,
        Key: key,
        ContentType: 'text/javascript',
        CacheControl: 'public,max-age=3600',
      }, (err) => {
        if(err) {
          reject(err);
        } else {
          resolve();
        }
      });
    }
  });
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
      let fileStream = fs.createReadStream(p.path);
      const bucketPath = path.join(destinationDir, path.relative(sourceDir, p.path));
      let contentType = lookup(p.path) || 'text/plain';
      let contentEncoding = undefined;
      if(contentType === 'application/wasm') {
        core.info(`Compressing wasm ${p.path} with brotli`);
        fileStream = fileStream.pipe(zlib.createBrotliCompress());
        contentEncoding = 'br';
      }

      const params = {
        Bucket: BUCKET,
        Body: fileStream,
        Key: bucketPath,
        CacheControl: 'public,max-age=31536000,immutable',
        ContentType: contentType
      };
      if(contentEncoding) {
        params.ContentEncoding = contentEncoding;
      }
      return upload(params);
    })
  );
  let infoUpdate = updateInfo();
  let symUpdate = SYMLINK ? updateSymlink() : Promise.resolve();
  return Promise.all([fileUploads, infoUpdate, symUpdate]);
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