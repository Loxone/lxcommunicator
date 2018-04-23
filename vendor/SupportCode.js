"use strict";

(function() {

    var SupportCode = function SupportCode() { };

    // 1000 - 1999 = General Issues
    SupportCode.PARSING_MESSAGE_FAILED = 1000; // parsing a (json) message failed
    SupportCode.DECRYPTING_RESPONSE_VALUE_FAILED = 1001; // decrypting of response value failed

    // 2000 - 2999 = Websocket
    SupportCode.WEBSOCKET_NOT_READY = 2000; // the websocket is not ready (connection/authentication)
    SupportCode.WEBSOCKET_ERROR = 2001; // a websocket error occurred
    SupportCode.WEBSOCKET_CLOSE = 2002; // the websocket closed with some reason
    SupportCode.WEBSOCKET_MANUAL_CLOSE = 2003; // the websocket was manually closed
    SupportCode.WEBSOCKET_TIMEOUT = 2004; // the timeout timed out
    SupportCode.WEBSOCKET_MISSING_HEADER = 2005; // a payload without header was received
    SupportCode.WEBSOCKET_WRONG_PACKAGE = 2006; // payload has different size then the header promised
    SupportCode.WEBSOCKET_NOT_SECURED = 2007; // the websocket connection isn't secured but we tried to send an encrypted command -> not possible/allowed!
    SupportCode.WEBSOCKET_OUT_OF_SERVICE = 2008; // the Miniserver is going to reboot

    // 3000 - 3499 = Statistic
    SupportCode.STATISTIC_MANUAL_CANCEL = 3000; // the request was canceled manually (navigate back)
    SupportCode.STATISTIC_NO_DATA_AVAILABLE = 3001; // no data for the requested date is available
    SupportCode.STATISTIC_DISPATCH_PREPARING_FAILED = 3002; // something went wrong while preparing to dispatch data
    SupportCode.STATISTIC_ERROR = 3003; // a 'general' error while processing a request, debug for more info!
    SupportCode.STATISTIC_DOWNLOAD_ERROR = 3004; // error while downloading statistic data
    SupportCode.STATISTIC_CACHE_ERROR = 3005; // error while loading cached statistic data
    SupportCode.STATISTIC_PARSE_ERROR = 3006; // error while parsing statistic data
    SupportCode.STATISTIC_BINARY_CONVERSION_ERROR = 3007; // error while loading cached statistic data
    SupportCode.STATISTIC_CACHING_ERROR = 3008; // error while caching statistic data

    // 3500 - 3999 = Worker

    //////////////////////////////////////////////////////////////////////
    module.exports = SupportCode;
    //////////////////////////////////////////////////////////////////////
}).call(this);
