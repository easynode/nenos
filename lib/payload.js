/**
 * Created by allen.hu on 15/8/7.
 */
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.deletePayload = undefined;

var _ejs = require('ejs');

var _ejs2 = _interopRequireDefault(_ejs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * get bulk delete object payload
 * @param {boolean} quiet=false
 * @param {Array} objects objects to delete
 * @param {Number} objects.key
 * @param {Number} objects.version
 * @returns {*}
 */
var deletePayload = exports.deletePayload = function deletePayload(_ref) {
    var _ref$quiet = _ref.quiet;
    var quiet = _ref$quiet === undefined ? false : _ref$quiet;
    var _ref$objects = _ref.objects;
    var objects = _ref$objects === undefined ? [] : _ref$objects;


    if (!objects.length) {
        return '';
    }
    return _ejs2.default.render(BulkDeleteEjs, { quiet: quiet, objects: objects });
};

var BulkDeleteEjs = '\n<Delete>\n    <% if(quiet) { %><Quiet>true</Quiet><% } %>\n    <% objects.forEach(function(object) { %>\n    <Object>\n        <Key><%= object.key %></Key>\n        <% if(object.version) { %><VersionId><%= object.version %></VersionId><% } %>\n    </Object>\n    <% }) %>\n</Delete>\n';