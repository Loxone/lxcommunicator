(function() {
    var jquery = {},
        // axios response object is different from ajax,
        // we adopt axios response to match the ajax response
        _tmpAjax = require('axios');
    jquery.ajax = function ajax() {
        return _tmpAjax.apply(this, arguments).then(function(resObj) {
            resObj = resObj.data;
            return resObj;
        }.bind(this));
    };
    module.exports = jquery;
}).call(this);
