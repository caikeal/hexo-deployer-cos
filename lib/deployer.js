'use strict'

const os = require('os')
const fs = require('hexo-fs')
const chalk = require('chalk')
const COS = require('cos-nodejs-sdk-v5')
const path = require('path')

module.exports = function (args) {
  // Hexo's Logger
  let log = this.log

  // Check the user's configuration
  if (!checkHexoConfig(args)) {
    log.error('hexo-deployer-cos: config error')
    return
  }

  // Get local files path list from Public Directory
  let localFiles = fs.listDirSync(this.public_dir)
  // Set local files path list with COS path prefix
  let localFilesWithCOSPrefix = localFiles.map(key => path.join(args.pathPrefix, key))

  // Create COS object
  let cos = new COS({
    SecretId: args.secretId,
    SecretKey: args.secretKey
  })

  // Bucket's configuration
  const bucketConfig = {
    Bucket: args.bucket,
    Region: args.region
  }

  // COS need delete because files in COS exist, but in local not exist
  let diffRemote
  // Get the files on the COS
  getFilesFromCOS(cos, bucketConfig, args.pathPrefix)
    .catch(err => {
      log.error(err)
    })
    .then(remoteFiles => {
      let local = new Set(localFilesWithCOSPrefix)
      diffRemote = new Set(remoteFiles.filter(x => !local.has(x.Key)))
    })

  if (diffRemote) {
    log.info('Deleting files from COS...')
    deleteFileFromCOS(cos, bucketConfig, Array.from(diffRemote.map(value => { return { Key: value.Key } })))
      .catch(err => {
        console.log(err)
      })
      .then(data => {
        if (data.statusCode === 200) {
          log.info('Done: ', JSON.stringify(data.Deleted))
        }
      })
  }

  log.info('Uploading files to COS...')

  return Promise.all(localFiles.map(file => {
    return uploadFileToCOS(cos, bucketConfig, {
      path: path.join(this.public_dir, file),
      name: getFileName(path.join(args.pathPrefix, file))
    }).catch(err => {
      console.log(err)
    }).then(data => {
      if (data.statusCode === 200) {
        log.info('Done: ', file)
      }
    })
  }))
}

/**
 * Check if the configuration is correct in _config.yml file
 * @param {string} args
 * @return {boolean}
 */
function checkHexoConfig (args) {
  if (!args.secretId ||
    !args.secretKey ||
    !args.bucket ||
    !args.region ||
    !args.pathPrefix) {
    let tips = [
      chalk.red('Ohh~We have a little trouble!'),
      'Please check if you have made the following settings',
      'deploy:',
      '  type: cos',
      '  secretId: yourSecretId',
      '  secretKey: yourSecretKey',
      '  bucket: yourBucket',
      '  region: yourRegion',
      '  pathPrefix: yourPathPrefix',
      '',
      'Need more help? You can check the Tencent cloud document: ' + chalk.underline('https://www.qcloud.com/document/product/436')
    ]
    console.log(tips.join('\n'))
    return false
  } else {
    return true
  }
}

/**
 * Get Bucket file
 * @param {object} cos
 * @param {object} config
 * @param {string} pathPrefix
 */
function getFilesFromCOS (cos, config, pathPrefix) {
  return new Promise((resolve, reject) => {
    cos.getBucket({ ...config, Prefix: pathPrefix }, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data.Contents)
      }
    })
  })
}

/**
 * Upload file to COS
 * @param {object} cos
 * @param {object} config
 * @param {object} file
 */
function uploadFileToCOS (cos, config, file) {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: config.Bucket,
      Region: config.Region,
      Key: file.name,
      Body: fs.createReadStream(file.path)
    }, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

/**
 * if OS is Windows, replace the path specific to '/' as filename
 * @param {string} filename
 * @returns {string} filename
 */
function getFileName (filename) {
  if (os.platform() === 'win32') {
    return filename.replace(/\\/g, '/')
  }
  return filename
}

/**
 * Batch delete files on the COS
 * @param {object} cos
 * @param {object} config
 * @param {Array} fileList
 */
function deleteFileFromCOS (cos, config, fileList) {
  return new Promise((resolve, reject) => {
    cos.deleteMultipleObject({
      Bucket: config.Bucket,
      Region: config.Region,
      Objects: fileList
    }, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}
