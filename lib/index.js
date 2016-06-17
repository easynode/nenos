/**
 * Created by allen.hu on 15/8/20.
 */
'use strict';

var _co = require('co');

var _co2 = _interopRequireDefault(_co);

var _ejs = require('ejs');

var _ejs2 = _interopRequireDefault(_ejs);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _md = require('md5');

var _md2 = _interopRequireDefault(_md);

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

var _urlencode = require('urlencode');

var _urlencode2 = _interopRequireDefault(_urlencode);

var _lodash = require('lodash');

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _payload = require('./payload');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var pub = false;
// algorithm to generate signature
var SHA256 = 'sha256';
// encoding of signature
var ENCODING = 'base64';
// default response content type
var XML_MINE = 'application/xml';
// promisify xml parse and request
var parseString = _bluebird2.default.promisify(require('xml2js').parseString);

/**
 * wrap request
 * @param {String} method
 * @param {String} uri
 * @param {Buffer|String} [body] data to send
 * @param {Object} headers
 */
function nosRequest(_ref) {
    var method = _ref.method;
    var uri = _ref.uri;
    var _ref$body = _ref.body;
    var body = _ref$body === undefined ? '' : _ref$body;
    var _ref$headers = _ref.headers;
    var headers = _ref$headers === undefined ? {} : _ref$headers;

    return new _bluebird2.default(function (resolve, reject) {
        (0, _request2.default)({ method: method, uri: uri, body: body, headers: headers }, function (err, response, body) {
            if (err) {
                return reject(err);
            }
            if (response.statusCode >= 400) {
                parseString(body).then(function (_ref2) {
                    var Error = _ref2.Error;

                    var e = {
                        code: Error.Code.join(''),
                        message: Error.Message.join('')
                    };
                    reject(e);
                }).catch(reject);
            } else if (body) {

                if (typeof body === 'string' && response.headers['content-type'].toLowerCase() === XML_MINE) {
                    parseString(body).then(function (json) {
                        resolve(json);
                    }).catch(reject);
                } else {
                    resolve((0, _lodash.assign)({ body: body, url: headers.url }));
                }
            } else {
                var ret = (0, _lodash.pick)(response.headers, ['content-type', 'x-nos-request-id', 'etag', 'content-range', 'last-modified', 'content-length']);
                (0, _lodash.assign)(ret, { url: headers.url });
                resolve(ret);
            }
        });
    });
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

    var hmac = _crypto2.default.createHmac(SHA256, secretKey);

    var headers = canonicalizedHeaders.map(function (header) {
        return header.toLowerCase();
    }).sort().join('\n');

    var data = method + '\n' + contentMd5 + '\n' + contentType + '\n' + date + '\n';

    if (headers && headers.length) {
        data += headers + '\n';
    }
    data += canonicalizedResource;
    hmac.update(data);
    return hmac.digest(ENCODING);
}

function authorize(accessKey, secretKey, method, contentMd5, contentType, date, canonicalizedHeaders, canonicalizedResource) {
    return 'NOS ' + accessKey + ':' + generateSignature.apply(null, [].slice.call(arguments, 1));
}

function genResource(bucket, objectKey) {
    var query = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];


    var ret = '/' + bucket + '/' + objectKey;

    if (Object.keys(query).length) {
        ret += '?' + (0, _urlencode2.default)(_querystring2.default.stringify(opts));
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
var del = function del(host, accessKey, secretKey, bucket, objectKey) {
    var opts = arguments.length <= 5 || arguments[5] === undefined ? {} : arguments[5];

    var date = utcDate();
    var resource = genResource(bucket, objectKey, opts);
    var authorization = authorize(accessKey, secretKey, 'DELETE', [], "", date, resource);

    var url = 'http://' + bucket + '.' + host + '/' + objectKey;
    var headers = {
        Date: date,
        Authorization: authorization
    };

    return nosRequest({ method: 'del', uri: url, headers: headers });
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
var bulkDel = function bulkDel(host, accessKey, secretKey, bucket, objects) {
    var opts = arguments.length <= 5 || arguments[5] === undefined ? {} : arguments[5];


    if (!objects.length) {
        return _bluebird2.default.reject(new Error('nothing to delete'));
    }

    var date = utcDate();
    var content = (0, _payload.deletePayload)({ objects: objects, quiet: opts.quiet });
    var contentLength = content.length;
    var url = 'http://' + bucket + '.' + host + '/?delete';
    var authorization = authorize(accessKey, secretKey, 'POST', '', '', date, [], '');

    var headers = {
        Date: date,
        Authorization: authorization,
        'Content-Length': contentLength
    };

    return nosRequest({ method: 'post', body: content, headers: headers, uri: url }).then(function (res) {
        if (!opts.quiet) {
            if (res.DeleteResult) {
                var _Error = res.DeleteResult.Error;

                var ret = _Error.map(function (detail) {
                    return {
                        key: detail.Key.join(''),
                        code: detail.Code.join(''),
                        message: detail.Message.join('')
                    };
                });
                return { error: ret };
            } else {
                return {};
            }
        }
        var _res$DeleteResult = res.DeleteResult;
        var _res$DeleteResult$Del = _res$DeleteResult.Deleted;
        var Deleted = _res$DeleteResult$Del === undefined ? [] : _res$DeleteResult$Del;
        var _res$DeleteResult$Err = _res$DeleteResult.Error;
        var Error = _res$DeleteResult$Err === undefined ? [] : _res$DeleteResult$Err;

        var deleted = Deleted.map(function (detail) {
            return detail.Key.join('');
        });
        var error = Error.map(function (detail) {
            return {
                key: detail.Key.join(''),
                code: detail.Code.join(''),
                message: detail.Message.join('')
            };
        });
        return { deleted: deleted, error: error };
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
function getObject(host, accessKey, secretKey, bucket, objectKey) {
    var expires = arguments.length <= 5 || arguments[5] === undefined ? 0 : arguments[5];
    var opts = arguments.length <= 6 || arguments[6] === undefined ? {} : arguments[6];

    var date = utcDate();

    if (opts.versionId) url += '?versionId=' + opts.versionId;
    var resource = genResource(bucket, objectKey, (0, _lodash.pick)(opts, ['versionId']));
    var signature = encodeURIComponent(generateSignature(secretKey, 'GET', '', '', expires, [], resource));
    var url = pub ? 'http://' + bucket + '.' + host + '/' + objectKey : 'http://' + host + '/' + bucket + '/' + objectKey + '?NOSAccessKeyId=' + accessKey + '&Expires=' + expires + '&Signature=' + signature;
    var headers = { Date: date };
    if (opts.range) headers.Range = opts.range;
    if (opts.modifiedSince) headers['If-Modified-Since'] = opts.modifiedSince;
    headers['url'] = url;
    return nosRequest({ method: 'get', headers: headers, uri: url });
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
var getMeta = function getMeta(host, accessKey, secretKey, bucket, objectKey) {
    var expires = arguments.length <= 5 || arguments[5] === undefined ? 0 : arguments[5];
    var opts = arguments.length <= 6 || arguments[6] === undefined ? {} : arguments[6];

    var date = utcDate();
    if (opts.versionId) url += '?versionId=' + opts.versionId;
    var resource = genResource(bucket, objectKey, (0, _lodash.pick)(opts, ['versionId']));
    var authorization = authorize(accessKey, secretKey, 'HEAD', '', '', date, [], resource);
    var signature = (0, _urlencode2.default)(generateSignature(secretKey, 'HEAD', '', '', date, [], resource));
    var url = pub ? 'http://' + bucket + '.' + host + '/' + objectKey : 'http://' + host + '/' + bucket + '/' + objectKey + '?NOSAccessKeyId=' + accessKey + '&Expires=' + expires + '&Signature=' + signature;

    var headers = { Date: date };
    if (opts.modifiedSince) headers['If-Modified-Since'] = opts.modifiedSince;
    headers['url'] = url;

    return nosRequest({ method: 'head', uri: url, headers: headers }).then(function (res) {
        var contentType = res['content-type'];
        var lastModified = res['last-modified'];
        var etag = res['etag'];
        var requestId = res['x-nos-request-id'];
        return { contentType: contentType, lastModified: lastModified, etag: etag, requestId: requestId };
    });
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
var upload = function upload(host, accessKey, secretKey, bucket, objectKey, file) {
    var nosHeader = arguments.length <= 6 || arguments[6] === undefined ? {} : arguments[6];

    nosHeader['x-nos-storage-class'] = nosHeader['x-nos-storage-class'] || 'standard';
    var date = utcDate();
    var content = _fs2.default.readFileSync(file);
    var contentLength = content.length;
    var contentMd5 = (0, _md2.default)(content);

    var resource = genResource(bucket, objectKey);
    var canonicalizedHeaders = Object.keys(nosHeader).map(function (key) {
        return key + ':' + nosHeader[key];
    });
    var authorization = authorize(accessKey, secretKey, 'PUT', contentMd5, '', date, canonicalizedHeaders, resource);
    var url = 'http://' + bucket + '.' + host + '/' + objectKey;
    var headers = (0, _lodash.assign)({
        Date: date,
        'Content-Length': contentLength,
        'Content-MD5': contentMd5,
        Authorization: authorization,
        'url': url
    }, nosHeader);
    return nosRequest({ method: 'put', uri: url, body: content, headers: headers });
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
var copy = function copy(host, accessKey, secretKey, bucket, source, dest) {
    var date = utcDate();
    var url = 'http://' + bucket + '.' + host + '/' + dest;
    var resource = genResource(bucket, dest);
    var authorization = authorize(accessKey, secretKey, 'PUT', '', '', date, ['x-nos-copy-source:/' + (0, _urlencode2.default)('/' + bucket + '/' + source)], resource);
    var headers = {
        Date: date,
        Authorization: authorization,
        'x-nos-copy-source': (0, _urlencode2.default)('/' + bucket + '/' + source)
    };
    return nosRequest({ method: 'put', uri: url, headers: headers });
};

var move = function move(host, accessKey, secretKey, bucket, source, dest) {
    var date = utcDate();
    var url = 'http://' + bucket + '.' + host + '/' + dest;
    var resource = genResource(bucket, dest);
    var authorization = authorize(accessKey, secretKey, 'PUT', '', '', date, ['x-nos-move-source:' + (0, _urlencode2.default)('/' + bucket + '/' + source)], resource);
    var headers = {
        Date: date,
        Authorization: authorization,
        'x-nos-move-source': (0, _urlencode2.default)('/' + bucket + '/' + source)
    };
    return nosRequest({ method: 'put', uri: url, headers: headers });
};

function utcDate() {
    var date = arguments.length <= 0 || arguments[0] === undefined ? new Date() : arguments[0];

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
module.exports = function (p, host, accessKey, secretKey, bucket) {
    pub = p;
    return {
        del: del.bind(null, host, accessKey, secretKey, bucket),
        bulk: bulkDel.bind(null, host, accessKey, secretKey, bucket),
        copy: copy.bind(null, host, accessKey, secretKey, bucket),
        getMeta: getMeta.bind(null, host, accessKey, secretKey, bucket),
        getObject: getObject.bind(null, host, accessKey, secretKey, bucket),
        upload: upload.bind(null, host, accessKey, secretKey, bucket),
        move: move.bind(null, host, accessKey, secretKey, bucket)
    };
};