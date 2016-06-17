/**
 * Created by allen.hu on 15/8/20.
 */
'use strict'
import co from 'co';
import ejs from 'ejs';
import fs from 'fs';
import md5 from 'md5';
import crypto from 'crypto';
import qs from 'querystring';
import urlencode from 'urlencode';
import {pick, assign} from 'lodash';
import Promise from 'bluebird';
import request from 'request';

import {deletePayload} from './payload';

var pub = false;
// algorithm to generate signature
const SHA256 = 'sha256';
// encoding of signature
const ENCODING = 'base64';
// default response content type
const XML_MINE = 'application/xml';
// promisify xml parse and request
const parseString = Promise.promisify(require('xml2js').parseString);


/**
 * wrap request
 * @param {String} method
 * @param {String} uri
 * @param {Buffer|String} [body] data to send
 * @param {Object} headers
 */
function nosRequest({method, uri, body = '', headers = {}}) {
    return new Promise((resolve, reject) => {
        request({method, uri, body, headers}, function (err, response, body) {
            if (err) {
                return reject(err);
            }
            if(response.statusCode >= 400) {
                parseString(body)
                    .then(({Error}) =>  {
                        let e = {
                            code: Error.Code.join(''),
                            message: Error.Message.join('')
                        };
                        reject(e);
                    }).catch(reject);


            } else if(body) {

                if(typeof body === 'string' && response.headers['content-type'].toLowerCase() ===  XML_MINE) {
                    parseString(body)
                        .then(json => {
                            resolve(json);
                        })
                        .catch(reject);
                } else {
                    resolve( assign({body:body,url:headers.url}) );
                }
            } else {
                let ret = pick(response.headers, [
                    'content-type',
                    'x-nos-request-id',
                    'etag',
                    'content-range',
                    'last-modified',
                    'content-length']);
                assign( ret,{url:headers.url} );
                resolve(ret);
            }
        });
    })
}


//see: http://115.236.113.201/doc/nos_user_manual/_build/html/accessControl.html#head
/**
 * generate signature
 * @param secretKey
 * @param method
 * @param contentMd5
 * @param contentType
 * @param date
 * @param canonicalizedHeaders
 * @param canonicalizedResource
 * @return {String} signature
 * @private
 */
function generateSignature(secretKey, method, contentMd5, contentType, date, canonicalizedHeaders, canonicalizedResource) {

    let hmac = crypto.createHmac(SHA256, secretKey);

    let headers = canonicalizedHeaders.map(header => {
        return header.toLowerCase();
    }).sort().join('\n');

    let data = `${method}\n${contentMd5}\n${contentType}\n${date}\n`;

    if(headers && headers.length) {
        data += `${headers}\n`;
    }
    data += canonicalizedResource;
    hmac.update(data);
    return hmac.digest(ENCODING);
}

function authorize(accessKey, secretKey, method, contentMd5, contentType, date, canonicalizedHeaders, canonicalizedResource) {
    return `NOS ${accessKey}:${generateSignature.apply(null, [].slice.call(arguments, 1))}`;
}

function genResource(bucket, objectKey, query = {}) {

    let ret = `/${bucket}/${objectKey}`;

    if (Object.keys(query).length) {
        ret += `?${urlencode(qs.stringify(opts))}`;
    }
    return ret;
}

/**
 * 删除一个对象
 * @param {String} accessKey
 * @param {String} secretKey
 * @param {String} bucket
 * @param {String} objectKey
 * @param {Object} [opts]
 * @returns {Promise}
 */
const del = function (host,accessKey, secretKey, bucket, objectKey, opts = {}) {
    let date = utcDate();
    let resource = genResource(bucket, objectKey, opts);
    let authorization = authorize(accessKey, secretKey, 'DELETE', [], "", date, resource);

    let url = `http://${bucket}.${host}/${objectKey}`;
    let headers = {
        Date: date,
        Authorization: authorization
    };

    return nosRequest({method: 'del', uri: url, headers});
};
/**
 * 批量删除对象
 * @param {String} accessKey
 * @param {String} secretKey
 * @param {String} bucket
 * @param {Array} objects  要删除的对象
 * @param {Object} [opts]
 * @param {boolean} [opts.quiet]  是否安静删除
 */
const bulkDel = function (host,accessKey, secretKey, bucket, objects, opts = {}) {

    if (!objects.length) {
        return Promise.reject(new Error('nothing to delete'));
    }

    let date = utcDate();
    let content = deletePayload({objects, quiet: opts.quiet});
    let contentLength = content.length;
    let url = `http://${bucket}.${host}/?delete`;
    let authorization = authorize(accessKey, secretKey, 'POST', '', '', date, [], '');

    let headers = {
        Date: date,
        Authorization: authorization,
        'Content-Length': contentLength
    };

    return nosRequest({method: 'post', body: content, headers, uri: url})
        .then(res => {
            if(!opts.quiet) {
                if(res.DeleteResult) {
                    let {Error} = res.DeleteResult;
                    let ret = Error.map((detail) => {
                        return {
                            key: detail.Key.join(''),
                            code: detail.Code.join(''),
                            message: detail.Message.join('')
                        }
                    });
                    return {error: ret}
                } else {
                    return {};
                }
            }
            let {Deleted = [], Error = []} = res.DeleteResult;
            let deleted = Deleted.map(detail => {
                return detail.Key.join('');
            });
            let error = Error.map((detail) => {
                return {
                    key: detail.Key.join(''),
                    code: detail.Code.join(''),
                    message: detail.Message.join('')
                }
            });
            return {deleted, error};
        });
};
/**
 * 读取对象内容
 * @param {String} accessKey
 * @param {String} secretKey
 * @param {String} bucket
 * @param {String} objectKey
 * @param {Object} [opts]
 * @param {String} [opts.versionId] 版本
 * @param {String} [opts.modifiedSince]
 * @param {String} [opts.range] 用于断电续传
 * @returns {Promise}
 */
function getObject (host, accessKey, secretKey, bucket, objectKey,expires=0, opts = {}) {
    let date = utcDate();

    if (opts.versionId) url += `?versionId=${opts.versionId}`;
    let resource = genResource(bucket, objectKey, pick(opts, ['versionId']));
    let signature = encodeURIComponent( generateSignature(secretKey, 'GET', '', '', expires, [], resource) );
    let url = pub ? `http://${bucket}.${host}/${objectKey}`:`http://${host}/${bucket}/${objectKey}?NOSAccessKeyId=${accessKey}&Expires=${expires}&Signature=${signature}`;
    let headers = {Date: date};
    if (opts.range) headers.Range = opts.range;
    if (opts.modifiedSince) headers['If-Modified-Since'] = opts.modifiedSince;
    headers['url'] = url;
    return nosRequest({method: 'get', headers, uri: url})
}

/**
 * 获取对象相关元数据信息
 * @param {String} accessKey
 * @param {String} secretKey
 * @param {String} bucket
 * @param {String} objectKey
 * @param {Object} [opts]
 * @param {String} [opts.modifiedSince]
 * @returns {Promise}
 */
const getMeta = function (host,accessKey, secretKey, bucket, objectKey, expires=0, opts = {}) {
    let date = utcDate();
    if (opts.versionId) url += `?versionId=${opts.versionId}`;
    let resource = genResource(bucket, objectKey, pick(opts, ['versionId']));
    let authorization = authorize(accessKey, secretKey, 'HEAD', '', '', date, [], resource);
    let signature = urlencode( generateSignature(secretKey, 'HEAD', '', '', date, [], resource) );
    let url = pub ? `http://${bucket}.${host}/${objectKey}`:`http://${host}/${bucket}/${objectKey}?NOSAccessKeyId=${accessKey}&Expires=${expires}&Signature=${signature}`;

    let headers = {Date: date};
    if (opts.modifiedSince) headers['If-Modified-Since'] = opts.modifiedSince;
    headers['url'] = url;

    return nosRequest({method: 'head', uri: url, headers})
        .then(function(res) {
            let contentType = res['content-type'];
            let lastModified = res['last-modified'];
            let etag = res['etag'];
            let requestId = res['x-nos-request-id'];
            return {contentType, lastModified, etag, requestId};
        })
};
/**
 * 上传对象
 * @param {String} accessKey
 * @param {String} secretKey
 * @param {String} bucket
 * @param {String} objectKey
 * @param {String} file
 * @param {Object} nosHeader
 *
 */
const upload = function (host,accessKey, secretKey, bucket, objectKey, file, nosHeader = {}) {
    nosHeader['x-nos-storage-class'] = nosHeader['x-nos-storage-class'] || 'standard';
    let date = utcDate();
    let content = fs.readFileSync(file);
    let contentLength = content.length;
    let contentMd5 = md5(content);

    let resource = genResource(bucket, objectKey);
    let canonicalizedHeaders = Object.keys(nosHeader).map(key => {
        return `${key}:${nosHeader[key]}`
    });
    let authorization = authorize(accessKey, secretKey, 'PUT', contentMd5, '', date, canonicalizedHeaders, resource);
    let url = `http://${bucket}.${host}/${objectKey}`;
    let headers = assign({
        Date: date,
        'Content-Length': contentLength,
        'Content-MD5': contentMd5,
        Authorization: authorization,
        'url':url
        }, nosHeader);
    return nosRequest({method: 'put', uri: url, body: content, headers: headers});
};
/**
 * 远程拷贝操作，生成一个新的对象
 * @param {String} accessKey
 * @param {String} secretKey
 * @param {String} bucket
 * @param {String} source 源对象
 * @param {String} dest   目标对象
 * @returns {Promise}
 */
const copy = function (host, accessKey, secretKey, bucket, source, dest) {
    let date = utcDate();
    let url = `http://${bucket}.${host}/${dest}`;
    let resource = genResource(bucket, dest);
    let authorization = authorize(accessKey, secretKey, 'PUT', '', '', date, [`x-nos-copy-source:/${urlencode('/' + bucket + '/' + source)}`], resource);
    let headers = {
        Date: date,
        Authorization: authorization,
        'x-nos-copy-source': urlencode('/' + bucket + '/' + source)
    };
    return nosRequest({method: 'put', uri: url, headers});
};

const move = function (host,accessKey, secretKey, bucket, source, dest) {
    let date = utcDate();
    let url = `http://${bucket}.${host}/${dest}`;
    let resource = genResource(bucket, dest);
    let authorization = authorize(accessKey, secretKey, 'PUT', '', '', date, [`x-nos-move-source:${urlencode('/' + bucket + '/' + source)}`], resource);
    let headers = {
        Date: date,
        Authorization: authorization,
        'x-nos-move-source': urlencode('/' + bucket + '/' + source)
    };
    return nosRequest({method: 'put', uri: url, headers});
};

function utcDate(date = new Date()) {
    return date.toUTCString();
}

/**
 *
 * @param accessKey nos accessKey
 * @param secretKey nos secretKey
 * @param bucket nos bucket
 * @example
 * ```
 * var nos = require('node-nos')('accessKey', 'secretKey', 'bucket');
 * var file = 'readme'
 * nos
 *   .upload('key', file)
 *   .then(function(res) {})
 * ```
 */
module.exports =  function(p,host,accessKey, secretKey, bucket) {
    pub = p;
   return {
       del: del.bind(null, host, accessKey, secretKey, bucket),
       bulk: bulkDel.bind(null, host, accessKey, secretKey, bucket),
       copy: copy.bind(null, host, accessKey, secretKey, bucket),
       getMeta: getMeta.bind(null, host, accessKey, secretKey, bucket),
       getObject: getObject.bind(null,host, accessKey, secretKey, bucket),
       upload: upload.bind(null, host,accessKey, secretKey, bucket),
       move: move.bind(null, host, accessKey, secretKey, bucket)
   }
}
