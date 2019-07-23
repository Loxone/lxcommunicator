(function() {
    var jquery = {},
        // axios response object is different from ajax,
        // we adopt axios response to match the ajax response
        _tmpAjax = require('axios');
    jquery.ajax = function ajax() {
        return _tmpAjax.apply(this, arguments);
    };
    module.exports = jquery;
}).call(this);
