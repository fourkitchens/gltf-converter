const fs = require('fs');
const obj2gltf = require('obj2gltf');
const { S3 } = require('aws-sdk');
const stream = require('stream');
const temp = require('temp').track();
const unzip = require('unzip2');

const s3 = new S3({ region: process.env.S3_REGION }); // TODO - add creds

const gltfOptions = {}; // TODO - may need to add some stuff here, see https://github.com/AnalyticalGraphicsInc/obj2gltf/blob/master/lib/obj2gltf.js#L20-L39

module.exports = (event, context, cb) => {
  const records = event.Records.filter(
    record =>
      record.eventSource === 'aws:s3' &&
      record.eventName === 'ObjectCreated:Put'
  );

  Promise.all(
    records.map(record =>
      new Promise((resolve, reject) => {
        console.log('making tmpdir');
        temp.mkdir(record.s3.object.key, (err, res) => {
          if (err) {
            return reject(err);
          }
          return res;
        });
      })
        .then(
          tmpDir =>
            new Promise((resolve, reject) => {
              console.log('fetching from s3');
              const s3Object = {
                Key: decodeURIComponent(record.s3.object.key),
                Bucket: record.s3.bucket.name,
              };

              s3.getObject(s3Object, (err, res) => {
                if (err) {
                  return reject(err);
                }

                return resolve({
                  path: `${tmpDir}/${record.s3.object.key}`,
                  data: res,
                });
              });
            })
        )
        .then(
          ({ path, data }) =>
            new Promise((resolve, reject) => {
              console.log('writing contents');
              fs.writeFile(path, data, err => {
                if (err) {
                  return reject(err);
                }
                return resolve(path);
              });
            })
        )
        .then(
          path =>
            new Promise((resolve, reject) => {
              console.log('unzipping');
              const buffStream = new stream.PassThrough();

              buffStream
                .pipe(unzip.Extract({ path }))
                .on('close', () => resolve(path))
                .on('error', err => reject(err));
            })
        )
        .then(
          path =>
            new Promise((resolve, reject) => {
              console.log('finding obj files');
              fs.readDir(path, (err, res) => {
                if (err) {
                  return reject(err);
                }

                // This assumes that the files to convert will all be *.obj. If that
                // assumption is incorrect a different approach at discovery will be necessary.
                return resolve(res.filter(file => file.match(/.obj$/)));
              });
            })
        )
        .then(objFiles => {
          console.log('converting to gltf');
          return Promise.all(
            objFiles.map(objFile => obj2gltf(objFile, gltfOptions))
          );
        })
        .then(gltfs => gltfs.map(JSON.stringify))
        .then(gltfStrings => {
          console.log(`uploading ${gltfStrings.length} gltfs`);
          // TODO - each gltf string should be uploaded to its ultimate destination.
        })
        .then(() => {
          console.log(`done with ${record.s3.object.key}`);
        })
    )
  )
    .then(
      () =>
        new Promise((resolve, reject) => {
          console.log('cleaning up');
          temp.cleanup(err => {
            if (err) {
              return reject(err);
            }
            return resolve();
          });
        })
    )
    .then(() => {
      console.log('done with all records');
      cb();
    })
    .catch(err => {
      console.error(err);
      cb(err);
    });
};
