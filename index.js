const core = require('@actions/core');
const github = require('@actions/github');
const S3 = require('aws-sdk/clients/s3');
const fs = require('fs');
const path = require('path');
const shortid = require('shortid');
const klawSync = require('klaw-sync');
const { lookup } = require('mime-types');

const BUCKET = 'cdn.spooky.click';

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

console.log("INFO", github.context.ref, PKG_NAME, SOURCE_DIR);

/*

const DESTINATION_DIR = core.getInput('destination_dir', {
  required: false
});

const s3 = new S3({
  accessKeyId: AWS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY
});
const destinationDir = DESTINATION_DIR === '/' ? shortid() : DESTINATION_DIR;
const paths = klawSync(SOURCE_DIR, {
  nodir: true
});

function upload(params) {
  return new Promise(resolve => {
    s3.upload(params, (err, data) => {
      if (err) core.error(err);
      core.info(`uploaded - ${data.Key}`);
      core.info(`located - ${data.Location}`);
      resolve(data.Location);
    });
  });
}

function run() {
  const sourceDir = path.join(process.cwd(), SOURCE_DIR);
  return Promise.all(
    paths.map(p => {
      const fileStream = fs.createReadStream(p.path);
      const bucketPath = path.join(destinationDir, path.relative(sourceDir, p.path));
      const params = {
        Bucket: BUCKET,
        ACL: 'public-read',
        Body: fileStream,
        Key: bucketPath,
        ContentType: lookup(p.path) || 'text/plain'
      };
      return upload(params);
    })
  );
}

run()
  .then(locations => {
    core.info(`object key - ${destinationDir}`);
    core.info(`object locations - ${locations}`);
    core.setOutput('object_key', destinationDir);
    core.setOutput('object_locations', locations);
  })
  .catch(err => {
    core.error(err);
    core.setFailed(err.message);
  });

*/