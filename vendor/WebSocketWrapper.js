'use strict';

(function() {

    //////////////////////////////////////////////////////////////////////

    var BinaryEvent = require('../modules/BinaryEvent'),
        SupportCode = require('./SupportCode'),
        Debug = require('./Debug');

    // WebSocket requires a special treatment
    var WebSocketWrapper;
    if (typeof WebSocket === 'undefined') {
        WebSocketWrapper = require('websocket').w3cwebsocket;
    } else {
        WebSocketWrapper = WebSocket;
    }

    //////////////////////////////////////////////////////////////////////

        // Keepalive
    var KEEPALIVE_CMD = "keepalive",
        KEEPALIVE_INTERVAL = 2000,
        KEEPALIVE_TIMEOUT = 4000,
        DEFAULT_SOCKET_TIMEOUT = KEEPALIVE_TIMEOUT, // is equal to the keepalive timeout
        OPEN_CONNECTION_TIMEOUT = 15 * 1000;

    // TODO update file when changes where made:
    // https://docs.google.com/a/loxone.com/document/d/1ly7Fyf0GO67SL5JefzQj2eXZ9Dh7bOjYg54UuzUgOv8/edit#

    /**
     * LxWebSocket wrapper for native websocket
     * @param host
     * @param protocol
     * @param longTimeoutMode
     * @param disableKeepalive WARNING: if not disabled, you have to manually start the keepalive!
     * @returns {LxWebSocket}
     * @constructor
     */
    var LxWebSocket = function LxWebSocket(host, protocol, longTimeoutMode, disableKeepalive) {
        var self = this;

        // clean up host:
        if (host.indexOf("http://") === 0) { // we can't use our hasPrefix/hasSuffix helpers because of webworkers!
            host = host.replace("http://", "");
        }
        if (host.indexOf("/", (host.length - "/".length)) !== -1) {
            host = host.substring(0, host.length -1); // remove padding / -> is added below again!
        }

        self.ws = new WebSocketWrapper(protocol + host + "/ws/rfc6455?_=" + new Date().getTime(), "remotecontrol", null, null, null, { maxReceivedFrameSize: 0x800000 });
        self.ws.binaryType = "arraybuffer";

        self.longTimeoutMode = !!longTimeoutMode;

        self.incomingData = null;

        if (!disableKeepalive) {
            self.keepalive = initKeepaliveModule();
            self.keepaliveTimeout = null; // we use a seperate timeout for the keepalive commands
        }
        var timeout = initTimeoutModule(self.longTimeoutMode);

        // open socket timeout
        self._openSocketTimeout = setTimeout(function() {
            Debug.Socket.Basic && console.info(" - openSocketTimeout timed out!");
            self.close(SupportCode.WEBSOCKET_TIMEOUT);
        }, OPEN_CONNECTION_TIMEOUT);

        self.ws.onopen = function onopen() {
            clearTimeout(self._openSocketTimeout);
            self._openSocketTimeout = null;

            timeout.init(self.close.bind(self, SupportCode.WEBSOCKET_TIMEOUT), self.ws.incomingDataProgressFn);

            self.ws.onOpenFn();
        };


        self.ws.onmessage = function onmessage(msg) {
            msg = msg.data;

            // fix for case: Estimated Header > Payload (exact Header missing!)
            // only accept these payloads, if the size is exactly the same!
            var acceptMissingHeader = false;
            if (self.incomingData && self.incomingData.estimated && self.incomingData.length === msg.byteLength) {
                acceptMissingHeader = true;
                console.warn("WARNING: accepting payload after Estimated Header - Header missing!");
            }

            if (self.incomingData && (!self.incomingData.estimated || acceptMissingHeader)) {

                timeout.complied();

                if (typeof(msg) === "string") {
                    if (msg === "") { console.warn("WARNING: received empty string?"); return; }
                    Debug.Socket.Detailed && console.log("WebSocket received TextMessage (", msg.length, "chars )");

                    self.ws.onTextMessageFn && self.ws.onTextMessageFn(msg, self.incomingData.eventType);


                } else if (typeof(msg) === "object") {
                    if (msg.byteLength === 0) { console.warn("WARNING: received empty binary?"); return; }
                    Debug.Socket.Detailed && console.log("WebSocket received BinaryMessage (", msg.byteLength, "bytes )");

                    if (msg.byteLength === self.incomingData.length) {
                        Debug.Socket.Detailed && console.log("received the payload");

                        self.ws.onBinaryMessageFn && self.ws.onBinaryMessageFn(msg, self.incomingData.eventType);

                    } else {
                        console.error("ERROR: received binary with wrong length (", msg.byteLength, " bytes)!");

                        self.ws.onMessageErrorFn && self.ws.onMessageErrorFn("received binary with wrong length", SupportCode.WEBSOCKET_WRONG_PACKAGE);
                    }
                }

                self.incomingData = null;


            } else if (typeof(msg) === "string") {
                console.error("ERROR: received string ('" + msg + "') without LX-Bin-Header!");

            } else if (typeof(msg) === "object" && msg.byteLength === 8) {
                // we got an LX-Bin-Header!

                self.incomingData = BinaryEvent.identifyHeader(msg);

                if (self.incomingData.estimated) {
                    Debug.Socket.Detailed && console.info("received estimated header (type: " + BinaryEvent.getTypeString(self.incomingData.eventType) + " estimatedPayloadLength:", self.incomingData.length, "bytes)");

                    timeout.start(self.incomingData.length, true);
                    //self.incomingData = null; // set null, is only an info for timeout adoptions!

                } else if (self.incomingData.length === 0 && self.incomingData.eventType !== BinaryEvent.Type.OUTOFSERVICE && self.incomingData.eventType !== BinaryEvent.Type.KEEPALIVE) {
                    Debug.Socket.Detailed && console.info("received header telling 0 bytes payload - resolve request with null!");

                    self.ws.onBinaryMessageFn && self.ws.onBinaryMessageFn(null, self.incomingData.eventType);

                    timeout.complied();
                    self.incomingData = null;

                } else {
                    Debug.Socket.Detailed && console.log("received header (type: " + BinaryEvent.getTypeString(self.incomingData.eventType) + " payloadLength:", self.incomingData.length, "bytes)");

                    if (self.incomingData.eventType === BinaryEvent.Type.OUTOFSERVICE) {
                        console.warn("Miniserver out of service!");
                        self.incomingData = null;
                        self.close(SupportCode.WEBSOCKET_OUT_OF_SERVICE);
                        return;
                    }

                    if (self.incomingData.eventType === BinaryEvent.Type.KEEPALIVE) {
                        self.keepalive && self.keepalive.confirmed();
                        Debug.Socket.Keepalive && console.log("keepalive complied");
                        clearTimeout(self.keepaliveTimeout);
                        timeout.complied();
                        self.incomingData = null;

                    } else {

                        timeout.start(self.incomingData.length, false);
                    }
                }

            } else {

                console.error("ERROR: received binary (", msg.byteLength, " bytes) without header!");

                self.ws.onMessageErrorFn && self.ws.onMessageErrorFn("received binary without header", SupportCode.WEBSOCKET_MISSING_HEADER);
            }
        };


        self.ws.onerror = function onerror(e) {
            self.ws.onErrorFn("Websocket did close after error: " + e, SupportCode.WEBSOCKET_ERROR);
            self.onDestroy();
        };


        self.ws.onclose = function onclose(r) {
            self.ws.onCloseFn("Websocket did close with reason", SupportCode.WEBSOCKET_CLOSE, r);
            self.onDestroy();
        };


        self.onSend = function(msg) {
            Debug.Socket.Detailed && console.info("Websocket onSend:", msg);

            timeout.start();

            this.ws.send(msg);
        };


        self.onDestroy = function destroy() {
            clearTimeout(self._openSocketTimeout);
            self._openSocketTimeout = null;

            self.keepalive && self.keepalive.stop();
            clearTimeout(self.keepaliveTimeout);
            timeout.stop();

            // remove all handlers to make sure it can't be called anymore!
            if (self.ws) {
                self.ws.onopen = function (){};
                self.ws.onmessage = function (){};
                self.ws.onerror = function (){};
                self.ws.onclose = function (){};
                self.ws.incomingDataProgressFn = function (){};

                self.ws.close();
                self.ws = null;
            }
        };

        return self;
    };


    LxWebSocket.prototype = {
        get socketOpened() {
            return this.ws && this.ws.readyState === this.ws.OPEN;
        },
        get socketClosed() {
            return !this.ws || this.ws.readyState === this.ws.CLOSED;
        },
        set onOpen(fn) {
            this.ws.onOpenFn = fn;
        },
        set onError(fn) {
            this.ws.onErrorFn = fn;
        },
        set onClose(fn) {
            this.ws.onCloseFn = fn;
        },
        set onTextMessage(fn) {
            this.ws.onTextMessageFn = fn;
        },
        set onBinaryMessage(fn) {
            this.ws.onBinaryMessageFn = fn;
        },
        set onMessageError(fn) {
            this.ws.onMessageErrorFn = fn;
        },
        set incomingDataProgress(fn) {
            this.ws.incomingDataProgressFn = fn;
        }
    };


    LxWebSocket.prototype.send = function (msg) {
        this.onSend(msg);
    };


    LxWebSocket.prototype.close = function (code) {
        var wasOpened = !this.socketClosed, // check if socket was opened before calling onDestroy
            onCloseFn = this.ws && this.ws.onCloseFn; // save a reference of the onCloseFn because it will be reset in "onDestroy"!
        this.onDestroy();
        if (wasOpened && typeof onCloseFn === "function") {
            Debug.Socket.Basic && console.info("socketDidClose - (was opened) - " + code);
            onCloseFn.call(this, "Websocket gonna be closed manually now!", code || SupportCode.WEBSOCKET_CLOSE);
        } else {
            Debug.Socket.Basic && console.info("socketDidClose - (was already closed) - " + code);
        }
    };


    LxWebSocket.prototype.startKeepalive = function startKeepalive() {
        var self = this;

        self.keepalive && self.keepalive.start(function onKeepaliveFired() {

            // check, if we expect a (large) binary
            if (!self.incomingData) {

                Debug.Socket.Keepalive && console.log("start keepalive timeout");
                clearTimeout(self.keepaliveTimeout);
                self.keepaliveTimeout = setTimeout(function() {
                    Debug.Socket.Keepalive && console.warn("keepalive timeout fired, close the socket!");
                    self.close(SupportCode.WEBSOCKET_TIMEOUT);
                }, KEEPALIVE_TIMEOUT);

                self.onSend(KEEPALIVE_CMD);

            } else {
                self.keepalive.confirmed(); // confirm immediately when we don't send the Keepalive Command -> keepalive starts again...
                Debug.Socket.Detailed && console.info("skipping keepalive due to incoming data (length:", self.incomingData.length, "estimated:", self.incomingData.estimated, ")");
            }
        });
    };

    function initKeepaliveModule() {
        var keepaliveTimeout,
            onFireFn;

        /**
         * starts the keepalive
         */
        var startKeepalive = function startKeepalive(fn) {
            Debug.Socket.Keepalive && console.log("startKeepalive");
            clearTimeout(keepaliveTimeout);
            onFireFn = fn;
            keepaliveTimeout = setTimeout(onKeepaliveFired, KEEPALIVE_INTERVAL);
        };

        /**
         * gets fired after timeout
         */
        var onKeepaliveFired = function() {
            Debug.Socket.Keepalive && console.log("    keepalive fired...!");
            onFireFn();
        };

        /**
         * stops the keepalive
         */
        var stopKeepalive = function stopKeepalive() {
            Debug.Socket.Keepalive && console.log("stopKeepalive");
            clearTimeout(keepaliveTimeout);
            keepaliveTimeout = null;
            onFireFn = null;
        };

        /**
         * confimation of keepalive
         */
        var keepaliveConfirmed = function keepaliveConfirmed() {
            Debug.Socket.Keepalive && console.log("        ...keepalive confirmed, start new keepalive timeout!");
            keepaliveTimeout = setTimeout(onKeepaliveFired, KEEPALIVE_INTERVAL);
        };

        return {
            start: startKeepalive,
            stop: stopKeepalive,
            confirmed: keepaliveConfirmed,
            onFire: null
        }
    }


    function initTimeoutModule(longTimeoutMode) {

        var socketTimeout,
            onTimeoutFiredFn,
            onIncomingDataFn,
            // measurement
            currentPackage = {
                size: 0,
                headerTime: 0,
                payloadTime: 0
            },
            currentTimeout = OPEN_CONNECTION_TIMEOUT;

        var progress = {
            interval: 0,
            total: 0,
            downloaded: 0,
            pending: 0,
            percent: 0
        };


        /**
         * starts socket timeout
         * timeoutFn called when timeout fired
         * incomingDataFn called when data arrives (not really the trouth! only calculated) ;-)
         */
        var init = function init(timeoutFn, incomingDataFn) {
            Debug.Socket.Timeout && console.log("init the SocketTimeout");
            onTimeoutFiredFn = timeoutFn;
            onIncomingDataFn = incomingDataFn;
        };


        /**
         * starts socket timeout after a commands was sent
         */
        var startSocketTimeout = function startSocketTimeout() {
            Debug.Socket.Timeout && console.log("startSocketTimeout");

            clearTimeout(socketTimeout);
            //console.info("  ..timeout will be", currentTimeout, "ms");
            //socketTimeout = setTimeout(socketTimeoutFired, currentTimeout);
            if (currentTimeout > DEFAULT_SOCKET_TIMEOUT) {
                Debug.Socket.Timeout && console.info("  ..timeout will be", currentTimeout, "ms");
                socketTimeout = setTimeout(socketTimeoutFired, currentTimeout);
            } else {
                Debug.Socket.Timeout && console.info("  ..timeout too short, take default:", DEFAULT_SOCKET_TIMEOUT, "ms");
                socketTimeout = setTimeout(socketTimeoutFired, DEFAULT_SOCKET_TIMEOUT);
            }


            // start download progress
            clearInterval(progress.interval);
            progress.startTime = 0;
            progress.total = 0;
            progress.pending = 0;
            progress.downloaded = 0;
            if (currentPackage.size) {
                progress.startTime = currentPackage.headerTime;
                progress.total = currentPackage.size;
                progress.pending = progress.total;
                progress.estimated = currentPackage.estimated;
                var bPerMS = currentPackage.size / currentTimeout;
                progress.interval = setInterval(function() {

                    var bytesDownloaded = bPerMS * (new Date().valueOf() - progress.startTime);
                    progress.downloaded = Math.min(bytesDownloaded, progress.total);
                    progress.pending = progress.total - progress.downloaded;
                    progress.percent = (progress.downloaded / progress.total * 100).toFixed(1);

                    onIncomingDataFn && onIncomingDataFn(progress);

                    Debug.Socket.Basic && console.warn("progress:", progress.percent, "%");
                }, 500);
            } else {
                onIncomingDataFn && onIncomingDataFn(null);
            }
        };

        var timeoutCache = (function() {

            var cache = [],
                avgSpeed = 0,
                avgSize = 0;

            var calcAverageSpeed = function calcAverageSpeed() {
                var sum = 0;
                for (var i = 0; i < cache.length; i++) {
                    sum += cache[i].speed;
                }
                return Math.ceil(sum / cache.length);
            };

            var calcAverageSize = function calcAverageSize() {
                var sum = 0;
                for (var i = 0; i < cache.length; i++) {
                    sum += cache[i].bytes;
                }
                return Math.ceil(sum / cache.length);
            };


            var calcAverageTimeout = function calcAverageTimeout() {
                return Math.ceil(avgSize / avgSpeed * 2);
            };


            /**
             * calculates the average timeout for the given bytes
             * @param {number} bytes
             * @param {bool} [longMode] takes longest calculated timeout (+ x2!)
             * @returns {number} timeout in ms
             */
            var calcTimeoutForSize = function calcTimeoutForSize(bytes, longMode) {
                if (cache.length < 5 && !longMode) {
                    if (longTimeoutMode) {
                        // call again, skip this if, and take the longest
                        var longT = calcTimeoutForSize(bytes, true);
                        if (!isNaN(longT) && longT !== Infinity) {
                            return Math.max(OPEN_CONNECTION_TIMEOUT, longT) * 3; // x3!
                        }
                    }
                    return OPEN_CONNECTION_TIMEOUT;
                } else if (!bytes) {
                    return calcAverageTimeout();
                } else if (avgSize > bytes) {
                    return Math.ceil(bytes / avgSpeed * 2);
                } else {
                    //var factor = (bytes / avgSize) * (1 - (bytes - avgSize) / bytes);
                    //var factor = Math.max((bytes / avgSize / 2), 1); // factor minimum 1!
                    //factor = factor * Math.pow((1 / 1.004), factor); // 1.0065
                    //factor = Math.max(factor, 1.5);
                    var factor = bytes / avgSize;

                    if (factor < 10) {
                        factor = 2.5;
                    } else if (factor < 100) {
                        factor = 3;
                    } else if (factor < 200) {
                        factor = 3.5;
                    } else if (factor < 1000) {
                        factor = 4;
                    } else if (factor < 2000) {
                        factor = 4.5;
                    } else if (factor < 3000) {
                        factor = 5;
                    } else if (factor < 4000) {
                        factor = 5.5;
                    } else {
                        factor = 6;
                    }
                    Debug.Socket.Timeout && console.info("multiply timeout by factor:", factor, "because average data is too low");
                    Debug.Socket.Timeout && console.info("avgSize", avgSize);
                    return Math.ceil(bytes / avgSpeed * factor);
                }
            };


            var slower = function slower() {
                for (var i = 0; i < cache.length; i++) {
                    cache[i].speed *= 0.25;
                }
            };

            var removeSmallestMeasure = function() {
                var ss = cache[0];
                for (var i = 1; i < cache.length; i++) {
                    if (cache[i].bytes < ss.bytes) {
                        ss = cache[i];
                    }
                }
                cache.splice(cache.indexOf(ss), 1);
            };

            return {
                add: function (b, s) {
                    if (b < 20) return; // only count big packages
                    cache.push({ bytes: b, speed: s });
                    if (cache.length > 20) {
                        //cache.shift();
                        removeSmallestMeasure();
                    }
                    avgSpeed = calcAverageSpeed();
                    avgSize = calcAverageSize();
                },
                timeoutForSize: calcTimeoutForSize,
                slower: slower
            }

        })();


        /**
         * starts socket timeout dynamically according to bytes
         * @param {number} bytes
         * @param {bool} [estimated]
         */
        var start = function start(bytes, estimated) {
            Debug.Socket.Timeout && console.log("start timeout");

            currentPackage.size = bytes;
            currentPackage.headerTime = new Date().valueOf();
            currentPackage.estimated = estimated;

            // dynamic!
            currentTimeout = timeoutCache.timeoutForSize(bytes);
            Debug.Socket.Timeout && console.info("calculated timeout is", currentTimeout, "ms for size:", bytes, "bytes");

            startSocketTimeout();
        };


        /**
         * timeout could be complied, now calculate the speed of the connection
         */
        var complied = function complied() {
            Debug.Socket.Timeout && console.log("timeout complied");
            stopTimeout();

            if (currentPackage.size > 0) { // can only calculate, if we have something to measure!

                currentPackage.payloadTime = new Date().valueOf();
                var time = currentPackage.payloadTime - currentPackage.headerTime;

                if (time === 0) {
                    //console.info("same millisecond!");

                } else {

                    var bpms = Math.round(currentPackage.size / time);
                    Debug.Socket.Timeout && console.warn("needed", time, "ms for", currentPackage.size, "bytes =", bpms, "bytes/ms");

                    if (currentTimeout < time) {
                        Debug.Socket.Timeout && console.error("would close socket! (+", time - currentTimeout, "ms needed)");
                        timeoutCache.slower();
                    }

                    timeoutCache.add(currentPackage.size, bpms);
                }

                currentPackage.size = 0;
            }
        };


        /**
         * gets fired, if a command isn't confirmed within the timeout
         */
        var socketTimeoutFired = function socketTimeoutFired() {
            console.warn("ERROR: Socket Timeout fired! (timeout was " + currentTimeout + "ms)");
            onTimeoutFiredFn();
        };


        var stopTimeout = function() {
            clearTimeout(socketTimeout);
            clearInterval(progress.interval);
            onIncomingDataFn && onIncomingDataFn(null);
        };

        return {
            init: init,
            start: start,
            complied: complied,
            stop: stopTimeout
        }
    }

    //////////////////////////////////////////////////////////////////////
    module.exports = LxWebSocket;
    //////////////////////////////////////////////////////////////////////
}).call(this);
