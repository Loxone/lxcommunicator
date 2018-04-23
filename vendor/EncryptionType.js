(function() {
    module.exports = {
        NONE: 0,
        REQUEST: 1,                 // the request is encrypted
        REQUEST_RESPONSE_VAL: 2     // the request + the response value (only value!) is encrypted
    };
}).call(this);
