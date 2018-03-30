const fs = require('fs');
const obj2gltf = require('obj2gltf');
const { S3 } = require('aws-sdk');
const stream = require('stream');
const temp = require('temp').track();
const unzip = require('unzip2');

const s3 = new S3({ region: process.env.S3_REGION }); // TODO - add creds

const gltfOptions = {}; // TODO - may need to add some stuff here, see https://github.com/AnalyticalGraphicsInc/obj2gltf/blob/master/lib/obj2gltf.js#L20-L39

const converter = (event, context, cb) => {
  Promise.all(
    event.Records.filter(
      record =>
        record.eventSource === 'aws:s3' &&
        record.eventName === 'ObjectCreated:Put'
    )
    .map(record =>
      new Promise((resolve, reject) => {
        console.log(`making tmpdir for ${record.s3.object.key}`);
        temp.mkdir(record.s3.object.key, (err, res) => {
          if (err) {
            return reject(err);
          }
          return resolve(res);
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
                  data: res.Body,
                  tmpDir,
                });
              });
            })
        )
        .then(
          ({ data, tmpDir: path }) =>
            new Promise((resolve, reject) => {
              console.log(`unzipping ${data.length} bytes`);
              const buffStream = new stream.PassThrough();
              buffStream.end(data)

              buffStream
                .pipe(unzip.Extract({ path }))
                .on('close', () => {
                  console.log('unzipped');
                  resolve(path);
                })
                .on('error', err => reject(err));
            })
        )
        .then(
          path =>
            new Promise((resolve, reject) => {
              console.log('finding obj files');
              fs.readdir(path, (err, res) => {
                if (err) {
                  return reject(err);
                }

                // This assumes that the files to convert will all be *.obj. If that
                // assumption is incorrect a different approach at discovery will be necessary.
                return resolve(res.filter(file => file.match(/.obj$/)));
              })
            })
              .then(files => ({ path, files }))
        )
        .then(({ path, files }) => {
          console.log('converting to gltf');
          return Promise.all(
            files.map(objFile => obj2gltf(`${path}/${objFile}`, gltfOptions))
          );
        })
        .then(gltfs => gltfs.map(JSON.stringify))
        .then(gltfStrings => {
          console.log(`uploading ${gltfStrings.length} gltfs`);
          // TODO - each gltf string should be uploaded to its ultimate destination.
          // HELLO FUTURE DEVELOPER! This is where you need to start working.
          //           u
          //      .  x!X
          //    ."X M~~>
          //   d~~XX~~~k    .u.xZ `\ \ "%
          //  d~~~M!~~~?..+"~~~~~?:  "    h
          // '~~~~~~~~~~~~~~~~~~~~~?      `
          // 4~~~~~~~~~~~~~~~~~~~~~~>     '
          // ':~~~~~~~~~~(X+"" X~~~~>    xHL
          //  %~~~~~(X="      'X"!~~% :RMMMRMRs
          //   ^"*f`          ' (~~~~~MMMMMMMMMMMx
          //     f     /`   %   !~~~~~MMMMMMMMMMMMMc
          //     F    ?      '  !~~~~~!MMMMMMMMMMMMMM.
          //    ' .  :": "   :  !X""(~~?MMMMMMMMMMMMMMh
          //    'x  .~  ^-+="   ? "f4!*  #MMMMMMMMMMMMMM.
          //     /"               .."     `MMMMMMMMMMMMMM
          //     h ..             '         #MMMMMMMMMMMM
          //     f                '          @MMMMMMMMMMM
          //   :         .:=""     >       dMMMMMMMMMMMMM
          //   "+mm+=~("           RR     @MMMMMMMMMMMMM"
          //           %          (MMNmHHMMMMMMMMMMMMMMF
          //          uR5         @MMMMMMMMMMMMMMMMMMMF
          //        dMRMM>       dMMMMMMMMMMMMMMMMMMMF
          //       RM$MMMF=x..=" RMRM$MMMMMMMMMMMMMMF
          //      MMMMMMM       'MMMMMMMMMMMMMMMMMMF
          //     dMMRMMMK       'MMMMMMMMMMMMMMMMM"
          //     RMMRMMME       3MMMMMMMMMMMMMMMM
          //    @MMMMMMM>       9MMMMMMMMMMMMMMM~
          //   'MMMMMMMM>       9MMMMMMMMMMMMMMF
          //   tMMMMMMMM        9MMMMMMMMMMMMMM
          //   MMMM$MMMM        9MMMMMMMMMMMMMM
          //  'MMMMRMMMM        9MMMMMMMMMMMMM9
          //  MMMMMMMMMM        9MMMMMMMMMMMMMM
          //  RMMM$MMMMM        9MMMMMMMMMMMMMM
          // tMMMMMMMMMM        9MMMMMMMMMMMMMX
          // RMMMMMMMMMM        9MMMMMMMMMMMMME
          // JMMMMMMMMMMM        MMMMMMMMMMMMMME
          // 9MMMM$MMMMMM        RMMMMMMMMMMMMME
          // MMMMMRMMMMMX        RMMMMMMMMMMMMMR
          // RMMMMRMMMMME        EMMMMMMMMMMMMM!
          // 9MMMMMMMMMME        MMMMMMMMMMMMMM>
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

module.exports = {
  converter,
};
