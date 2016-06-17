/**
 * Created by allen.hu on 15/8/7.
 */
'use strict';
import ejs from 'ejs';

/**
 * get bulk delete object payload
 * @param {boolean} quiet=false
 * @param {Array} objects objects to delete
 * @param {Number} objects.key
 * @param {Number} objects.version
 * @returns {*}
 */
export const deletePayload = function ({quiet = false, objects = []}) {

    if (!objects.length) {
        return '';
    }
    return ejs.render(BulkDeleteEjs, {quiet, objects});
};

const BulkDeleteEjs = `
<Delete>
    <% if(quiet) { %><Quiet>true</Quiet><% } %>
    <% objects.forEach(function(object) { %>
    <Object>
        <Key><%= object.key %></Key>
        <% if(object.version) { %><VersionId><%= object.version %></VersionId><% } %>
    </Object>
    <% }) %>
</Delete>
`;

