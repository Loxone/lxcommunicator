'use strict';

(function() {
    var ResponseCode = {
            MISSING_CREDS: 0,
            OK: 200,
            CODE_IN_USE: 201,                   // custom lx status code.
            SERIAL_NO_CHANGED: 301,
            BAD_REQUEST: 400,
            UNAUTHORIZED: 401,
            API_REQUEST_NOT_ALLOWED: 401,
            BLOCKED_TEMP: 403,
            NOT_FOUND: 404,
            SOCKET_FAILED: 418,
            FORBIDDEN: 423,                     // used e.g. for nfc code touch if an output cannot be controlled
            MS_UPDATE_REQUIRED: 426,
            INVALID_TOKEN: 477,                 // Like an 401 but that when the token is no longer valid.
            SECURED_CMD_FAILED: 500,
            MS_OUT_OF_SERVICE: 503,
            WAITING_FOR_NW: 601,
            CLOUDDNS_ERROR: 700,                // > 700 = CloudDNS Errors
            CLOUDDNS_NOT_REGISTERED: 701,       // starting 1.1.2015
            CLOUDDNS_NOT_CONFIGURED: 702,
            CLOUDDNS_PORT_CLOSED: 703,
            CLOUDDNS_SECURE_PWD_REQUIRED: 704,
            CLOUDDNS_DENIED_CUSTOM_MESSAGE: 705,
            REQUEST_TIMEOUT: -1
        },
        WebSocketCloseCode = {
            BLOCKED: 4003           // = temporarily blocked
        },
        DLSOCKET_MAX_IDLE_TIME = 30 * 1000, // after 30 secs close!
        HASH_VALID_TIME = 5 * 1000 - 500; // about 5s (minus ping time..)

    // Require and check for any modules
    //////////////////////////////////////////////////////////////////////

    var Q = require('q'),
        CryptoJS = require('crypto-js'),
        WebSocketConfig = require('./WebSocketConfig'),
        WebSocketWrapper = require('../vendor/WebSocketWrapper'),
        HttpRequest = require('./HttpRequest'),
        TokenHandler = require('./TokenHandler'),
        BinaryEvent = require('./BinaryEvent'),
        SupportCode = require('../vendor/SupportCode'),
        Commands = require('../vendor/Commands'),
        FeatureCheck = require('../vendor/FeatureCheck'),
        CryptoAdapter = require('../vendor/CryptoAdapter'),
        Utils = require('../vendor/Utils'), // <- This adds some global functions
        Debug = require('../vendor/Debug'),
        $ = require('../vendor/JqueryWrapper'),
        EncryptionType = require('../vendor/EncryptionType');

    //////////////////////////////////////////////////////////////////////

    /**
     * WebSocket handles communication via the websocket
     * @constructor
     */
    function WebSocket(conf) {
        this._config = conf;
        this.name = this._config.isDownloadSocket ? "LxDownloadWebSocket: " : "WebSocket: ";
        this._isDownloadSocket = this._config.isDownloadSocket;
        this._authActive = false;        // set to true while authentication is in progress.
        this._authTokenBased = false;
        this._invalidToken = false;
        this._waitingQueue = [];
        this._requests = [];
        this._encryption = {
            saltTimestamp: 0,
            salt: null, // current salt, must alternate with each encrypted command
            key: null,  // AES key for the current session
            iv: null    // AES iv
        };
        this._hashAlg = CryptoAdapter.HASH_ALGORITHM.SHA1;
    }


    // public methods
    /**
     * initializes websocket, opens it and attaches listeners
     * @param host address to which the connection should be established
     * @param user credentials required for secure authentication
     * @param password credentials required for secure authentication
     * @param [authToken]       if the initial authentication has already been passed, tokens will be used instead of pwds.
     * @returns {promise|*} promise whether the attempt was successful or not
     */
    WebSocket.prototype.open = function open(host, user, password, authToken) {
        this._httpCom = new HttpRequest();
        return this._resolveHost(host).then(function (resHost) {
            Debug.Socket.Basic && console.log(this.name + "try to open WebSocket to host:", resHost);

            this._tokenHandler = new TokenHandler(this, this._config.uniqueId, this._config.deviceInfo, function(tkObj) {
                this._config.delegate.socketOnTokenRefresh && this._config.delegate.socketOnTokenRefresh(this, tkObj);
            }.bind(this));
            var encryptionAllowed = FeatureCheck.check(FeatureCheck.feature.TOKENS),
                supportsTokens = FeatureCheck.check(FeatureCheck.feature.TOKENS);

            this._hashAlg = FeatureCheck.check(FeatureCheck.feature.SHA_256) ? CryptoAdapter.HASH_ALGORITHM.SHA256 : CryptoAdapter.HASH_ALGORITHM.SHA1;

            if (this._ws && this._ws.ws && !this._ws.socketClosed) {
                console.warn(this.name + "===============================================================");
                console.warn(this.name + "WARNING: WebSocket is maybe still opened! readyState:", this._ws.ws.readyState);
                console.warn(this.name + " - we now open another new WebSocket..");
                console.warn(this.name + " - old WebSocket will be closed..");
                console.warn(this.name + "===============================================================");

                this._ws.close(SupportCode.WEBSOCKET_MANUAL_CLOSE);
            }

            this._socketPromise = Q.defer();

            this._wrongPassword = false;
            this._invalidToken = false;

            if (this._isDownloadSocket) {
                this._ws = new WebSocketWrapper(resHost, this._config.protocol, true, true); // long timeout, no keepalive
            } else {
                this._ws = new WebSocketWrapper(resHost, this._config.protocol);
            }

            this._ws.onOpen = this.wsOpened.bind(this, resHost, user, password, encryptionAllowed, supportsTokens, authToken);
            this._ws.onMessageError = this._messageErrorHandler.bind(this);
            this._ws.onTextMessage = this._textMessageHandler.bind(this);
            this._ws.onBinaryMessage = this._binaryMessageHandler.bind(this);
            this._ws.onClose = this._closeHandler.bind(this);
            this._ws.onError = this._errorHandler.bind(this);
            this._ws.incomingDataProgress = function (progress) {
                if (this._isDownloadSocket) {
                    this._config.delegate.socketOnDataProgress && this._config.delegate.socketOnDataProgress(this, progress);
                }
            }.bind(this);

            return this._socketPromise.promise.then(function() {
                if (!this._isDownloadSocket) { // DLSocket has no keepalive
                    this._ws.startKeepalive();
                }
            }.bind(this));
        }.bind(this));
    };

    WebSocket.prototype.wsOpened = function wsOpened(host, user, password, encryptionAllowed, supportsTokens, authToken) {
        Debug.Socket.Basic && console.log(this.name, "wsOpened");

        if (encryptionAllowed) {
            this._exchangeKeys(host).then(function(oneTimeSalt) {
                if (supportsTokens) {
                    var msPermission = this._config.requiredPermission;
                    if (authToken) {
                        Debug.Socket.Basic && console.log(this.name, "Authenticate with a token " + msPermission);
                        this._authWithToken(user, authToken, msPermission, oneTimeSalt);
                    } else {
                        Debug.Socket.Basic && console.log(this.name, "Request a new token " + msPermission);
                        this._acquireToken(user, password, msPermission);
                    }
                } else {
                    this._authenticate(user, password, oneTimeSalt, true);
                }

            }.bind(this), function(res) {
                // res can be an error too (.done)
                // handle code 401 -> means that the publicKey has changed!
                if (typeof res === "object" &&
                    res.LL &&
                    getLxResponseCode(res) === 401) {
                    // close the socket..
                    console.error("keyexchange responded 401 - the public key might have changed! don't allow " +
                        "connection -> security!");
                    this.close();
                    //TODO-woessto: shouldn't there be some kind of information?

                } else if (res === SupportCode.WEBSOCKET_NOT_READY) {
                    // Do nothing so far, a close with the blocked-error-code will follow
                    Debug.Socket.Basic && console.log(this.name, "exchanging keys failed, socket not open - probably blocked");

                } else {
                    // simply close the socket, don't fallback to unencrypted!
                    this.close();
                }
            }.bind(this));

        } else {
            this._getKeyAndAuthenticate(user, password);
        }
    };

    /**
     *  closes the WebSocket
     */
    WebSocket.prototype.close = function close(reason) {
        Debug.Socket.Basic && console.log(this.name + "closing the connection");
        this._ws && this._ws.close(reason || SupportCode.WEBSOCKET_MANUAL_CLOSE);
        if (this._isDownloadSocket) {
            clearTimeout(this._closingTimer);
        }
    };


    WebSocket.prototype._getKeyAndAuthenticate = function _getKeyAndAuthenticate(user, password) {
        this._authStartTime = Date.now();

        this.send(Commands.GET_KEY, EncryptionType.NONE).done(function (result) {
            Debug.Socket.Basic && console.log(this.name + "getkey successful!");
            this._authenticate(user, password, result.LL.value, false);

        }.bind(this), function(e) {
            console.error(this.name + "getkey failed " + e);
        }.bind(this));
    };

    WebSocket.prototype._authenticate = function _authenticate(user, password, oneTimeSalt, encrypted) {
        var creds = user + ":" + password,
            hash = CryptoAdapter["Hmac" + this._hashAlg](creds, "utf8", oneTimeSalt, "hex", "hex"),
            cmd;

        // starting pw based authentication.
        this._setAuthenticating(true);

        if (encrypted) {
            Debug.Encryption && console.log(this.name + "hash hex: " + hash);
            var encryptedHash = CryptoAdapter.aesEncrypt(hash + "/" + user, this._encryption.key, this._encryption.iv);
            var ciphertext = encryptedHash.ciphertext;
            var ciphertextBase64 = ciphertext.toString(CryptoJS.enc.Base64);
            Debug.Encryption && console.log(this.name + "ciphertext base64: " + ciphertextBase64);
            cmd = Commands.format(Commands.ENCRYPTION.AUTHENTICATE, ciphertextBase64);
        } else {
            cmd = Commands.format(Commands.AUTHENTICATE, hash);
        }

        this.send(cmd, EncryptionType.NONE).then(this._handleSuccessFullAuth.bind(this), this._handleBadAuthResponse.bind(this));
    };

    WebSocket.prototype._handleSuccessFullAuth = function _handleSuccessFullAuth() {
        Debug.Socket.Basic && console.log(this.name + "authenticate successful!");

        // authenticated, reset flags.
        this._setAuthenticating(false);

        this._socketPromise.resolve(ResponseCode.OK);
        this._socketPromise = null;
    };

    /**
     * Will create a HmacSHA1 or HmacSHA256 hash based on the token and the oneTimeSalt provided & send it to
     * the Miniserver in an authentication request.
     * @param user          the user for which the authentication request is made
     * @param token         the authentication token for this user
     * @param permission     either a short lived WI token or a long lived app token.
     * @param oneTimeSalt   a short lived one time salt provided by the miniserver
     */
    WebSocket.prototype._authWithToken = function _authWithToken(user, token, permission, oneTimeSalt) {
        Debug.Socket.Basic && console.log("WebSocket", "authenticate with token");
        var hash = CryptoAdapter["Hmac" + this._hashAlg](token, "utf8", oneTimeSalt, "hex", "hex"),
            cmd = Commands.format(Commands.TOKEN.AUTHENTICATE, hash, user),
            response;

        // about to start token based authentication, set flags
        this._setAuthenticating(true, true);

        this.send(cmd, EncryptionType.REQUEST_RESPONSE_VAL).then(function(result) {
            Debug.Socket.Basic && console.log("WebSocket", "authenticate with token successful!");
            response = getLxResponseValue(result);

            // the token result might contain a new rights value.
            response.msPermission = response.tokenRights;

            //The username is a central part of the tokenObj, store it on the response & return it.
            response.username = user;

            // store the token itself on the tokenObj
            response.token = token;

            // emit the new token so it'll be stored.
            this._config.delegate.socketOnTokenConfirmed && this._config.delegate.socketOnTokenConfirmed(this, response);

            // make use of this helper as it ensures all attributes are properly set.
            this._handleSuccessFullAuth();

        }.bind(this), function (result) {
            console.error("WebSocket", "token authentication failed!");
            // no invalid password was sent, it was a bad authentication response based on an invalid token
            return this._handleBadAuthResponse(result, true)
        }.bind(this));
    };

    /**
     * Will use the tokenExt in the commComponent to acquire, store & handle the token.
     * @param user
     * @param password
     * @param msPermission
     */
    WebSocket.prototype._acquireToken = function _acquireToken(user, password, msPermission) {
        // starting authentication by requesting a token based on the password. Don't set the uses token flag yet.
        this._setAuthenticating(true);

        this._tokenHandler.requestToken(user, password, msPermission).then(function (result) {
            if (result && result.token) {
                Debug.Socket.Basic && console.log(this.name, "Token received!");
                this._tokenHandler.addToHandledTokens(result, result.username);

                // emit the new token so it'll be kept alive.
                this._config.delegate.socketOnTokenReceived && this._config.delegate.socketOnTokenReceived(this, result);

                // no need to authenticate after getToken success, the socket is authenticated as of now.
                this._handleSuccessFullAuth();
                return true;
            } else {
                throw new Error("Could not acquire token!");
            }
        }.bind(this), this._handleBadAuthResponse.bind(this));
    };

    /**
     * Will request a oneTimeSalt and return a hashed version of the payload required.
     * @param payload   the payload to create the onetime hash from.
     */
    WebSocket.prototype.getSaltedHash = function getSaltedHash(payload) {
        // Detect if encryption is supported at all.
        var encryptionType = FeatureCheck.check(FeatureCheck.feature.ENCRYPTED_CONNECTION_FULLY) ? EncryptionType.REQUEST_RESPONSE_VAL : EncryptionType.NONE;
        return this.send(Commands.GET_KEY, encryptionType).then(function(res) {
            var oneTimeSalt = getLxResponseValue(res, true);
            return CryptoAdapter["Hmac" + this._hashAlg](payload, "utf8", oneTimeSalt, "hex", "hex");
        }.bind(this));
    };

    /**
     * Called whenever the authentication failed.
     * @param result        the authentication result
     * @param [tokenBasedAuth]    optional, if true an invalid token was used for authentication
     */
    WebSocket.prototype._handleBadAuthResponse = function _handleBadAuthResponse(result, tokenBasedAuth) {
        Debug.Socket.Basic && console.log(this.name + "authenticate using " + (tokenBasedAuth ? "token" : "credentials")
            + " failed! " + JSON.stringify(result));

        // auth failed, reset flags.
        this._setAuthenticating(false);

        if (!result.LL) {
            return;
        }
        var code = getLxResponseCode(result);

        if (code === ResponseCode.UNAUTHORIZED) {
            this._handleBadAuthResponse(tokenBasedAuth, result.LL);

        } else if (code === ResponseCode.BAD_REQUEST) {
            this.close();
        }
    };

    /**
     * Called when the authenticate command came back negative with 401
     * @param tokenBasedAuth    true if a token was used to authenticate
     * @param resContent        the returned results LL-Object.
     * @private
     */
    WebSocket._handleUnauthorized = function _handleUnauthorized(tokenBasedAuth, resContent) {
        var diff = Date.now() - this._authStartTime;
        console.info("authentication took " + diff + "ms");

        // check how long it did take, the hash may have been invalid due to bad connection!
        if (diff > HASH_VALID_TIME) {
            console.info("authentication response took too long, oneTimeSalt may no longer be valid, retry");
            // it took too longer, the hash was was probably invalid, try again
            this._wrongPassword = false;  // handled in closeHandler
            this._invalidToken = false;   // also don't throw away tokens - they are probably also still valid.

        } else if (tokenBasedAuth) {
            // it was fast enough, the token is most certainly invalid

            // emit the new token so it'll be stored.
            this._config.delegate.socketOnTokenInvalid && this._config.delegate.socketOnTokenInvalid(this);

            this._invalidToken = true;    // handled in closeHandler
        } else {
            // it was fast enough, the credentials are most certainly invalid
            this._wrongPassword = true;   // handled in closeHandler
        }

        if (typeof resContent.unix === "number") {
            this._lastPwdChange = resContent.unix;
        } else {
            this._lastPwdChange = 0;
        }
        this.close();
    };

    /**
     * Generates a random AES key & IV, RSA-encrypts it and sends it to the Miniserver. The Miniserver then responds with
     * a oneTimeSalt that can be used for authentication right after this step. If the Public Key for RSA is not yet known,
     * it will acquire it.
     * @param host          the host for whom to acquire the public key
     * @returns {Promise}
     */
    WebSocket.prototype._exchangeKeys = function _exchangeKeys(host) {
        var cmd,
            rsaEncryptedSessionKey_base64;
        return this._httpCom.getPublicKey(host).then(function(publicKey) {
            this._encryption.key = CryptoAdapter.generateAesKey(this._config.uniqueId);
            this._encryption.iv = CryptoAdapter.generateAesIV();
            this._encryption.salt = null;         // reset salt + ts
            this._encryption.saltTimestamp = null;
            Debug.Encryption && console.info(this.name + "session key: " + this._encryption.key);
            Debug.Encryption && console.info(this.name + "session iv: " + this._encryption.iv);
            rsaEncryptedSessionKey_base64 = CryptoAdapter.rsaEncrypt(this._encryption.key + ":" + this._encryption.iv, publicKey);

            cmd = Commands.format(Commands.ENCRYPTION.KEY_EXCHANGE, rsaEncryptedSessionKey_base64);
            this._authStartTime = Date.now(); // important for handleBadAuthResponse - retry on poor connections
            return this.send(cmd, EncryptionType.NONE).then(function(result) {
                return Promise.resolve(CryptoAdapter.aesDecrypt(result.LL.value, this._encryption.key, this._encryption.iv)); // -> the key (like from getkey)
            }.bind(this), function(e) {
                console.log(e);
            }.bind(this));
        }.bind(this));
    };

    /**
     * handles error from the websocket
     * @param error
     * @param code
     */
    WebSocket.prototype._errorHandler = function _errorHandler(error, code) {
        console.error(this.name + "ERROR: websocket error");
        this._closeHandler.apply(this, arguments); // simply forward to closeHandler!
    };

    /**
     * called when WebSocket did close
     * @param error
     * @param code
     * @param [reason] of websocket close (not available when called from onerror)
     */
    WebSocket.prototype._closeHandler = function _closeHandler(error, code, reason) {
        Debug.Socket.Basic && console.info(this.name + "closeHandler: " + JSON.stringify(error) + ", " + code + ": reason = " + (reason ? reason.code : "--"));
        var blocked = false,
            remTxt, remaining = -1;

        // check if the closing feedback indicates that the IP has been temporarily blocked by the Miniserver
        if (reason && reason.code === WebSocketCloseCode.BLOCKED) {
            blocked = true;
            remTxt = reason.reason;
            try {
                remaining = parseInt(remTxt.substring(remTxt.lastIndexOf("(") + 1, remTxt.length - 1));
            } catch (e) {}
        }

        // queued requests need to be informed about the connection close too.
        this._resetRequestQueue(code);

        if (this._isDownloadSocket) {
            clearTimeout(this._closingTimer);

        } else if (this._socketPromise) {
            if (blocked) {
                console.log(this.name + reason.reason);
                this._socketPromise.reject({
                    errorCode: ResponseCode.BLOCKED_TEMP,
                    remaining: remaining
                });

            } else if (this._invalidToken) {
                this._socketPromise.reject({
                    errorCode: ResponseCode.INVALID_TOKEN
                });

            } else if (this._wrongPassword) {
                this._socketPromise.reject({
                    errorCode: ResponseCode.UNAUTHORIZED,
                    lastPwdChange: this._lastPwdChange
                });

            } else {
                console.error(this.name + " socket failed! WS Close Code: " + (reason ? (reason.code) : "-unknown-"));
                this._socketPromise.reject({
                    errorCode: ResponseCode.SOCKET_FAILED
                });

            }
            this._socketPromise = null;

        } else {
            this._config.delegate.socketOnConnectionClosed && this._config.delegate.socketOnConnectionClosed(this, code);
        }
    };

    /**
     * Used for sending commands.
     * @param request           the request (a string or an deferred with the cmd) to be sent
     * @param encryptionType    type of encryption for this command
     * @returns send command or rejects error.
     */
    WebSocket.prototype.send = function send(request, encryptionType) {
        var def = this._getDeferredForRequest(request, encryptionType),
            shouldEncrypt = this._usesEncryption(def.encryptionType),
            cmd = def.command;

        // inside getDeferredForCommand, the encryption type might be
        encryptionType = def.encryptionType;

        if (this._isDownloadSocket) {
            // stop closing!
            clearTimeout(this._closingTimer);
        }

        if (this._isSocketReadyForCmd(cmd)) {
            if (!this._currentRequest) {
                this._currentRequest = def;

                if (shouldEncrypt && this._encryptionSupported()) {
                    cmd = this._getEncryptedCommand(cmd, encryptionType);

                } else if (shouldEncrypt) {
                    // cannot send encrypted commands when the socket itself is not ready for it.
                    def.reject(SupportCode.WEBSOCKET_NOT_SECURED);
                    setTimeout(this._sendNextRequest);
                    return def.promise;
                }

                if (this._isDownloadSocket) {
                    Debug.DownloadSocketExt && console.info(this.name + "App -> Miniserver " + cmd);
                } else {
                    Debug.Socket.Basic && console.info(this.name + "App -> Miniserver " + cmd);
                }
                this._ws.send(cmd);
                this._currentRequest.promise.then(this._sendNextRequest.bind(this), this._sendNextRequest.bind(this));

            } else {
                this._requests.push(def);
            }

        } else if (this._isDownloadSocket) {
            Debug.DownloadSocketExt && console.log(this.name + "send '" + cmd + "'");
            Debug.DownloadSocketExt && console.log("    not ready -> waitingQueue");
            this._waitingQueue.push(def);

        } else {
            def.reject(SupportCode.WEBSOCKET_NOT_READY);
        }

        return def.promise;
    };

    /**
     * Called to set whether or not the authentication is currently in progress. Updates the internal state of this
     * websocket class. Required to respond properly to errors (such as 401 responses) during the process.
     * @param active        true if the authentication is currently in progress
     * @param usingToken    true if the authentication is based on tokens.
     * @private
     */
    WebSocket.prototype._setAuthenticating = function _setAuthenticating(active, usingToken) {
        this._authActive = active;
        this._authTokenBased = usingToken;
    };

    /**
     * Will return true if the authentication is currently in progress.
     * @param usingToken    if true, it will only return true if token based authentication is in progress.
     * @return {boolean}
     * @private
     */
    WebSocket.prototype._isAuthenticating = function _isAuthenticating(usingToken) {
        return this._authActive && (!usingToken || this._authTokenBased);
    };

    /**
     * Will check if encryption is supported or not.
     * @returns {boolean}
     * @private
     */
    WebSocket.prototype._encryptionSupported = function _encryptionSupported() {
        return (this._encryption.key && this._encryption.iv);
    };

    /**
     * check if this is a new request = string, or a request from the queue = promise!
     * @param cmd
     * @param encryptionType
     * @returns {*}
     * @private
     */
    WebSocket.prototype._getDeferredForRequest = function _getDeferredForRequest(cmd, encryptionType) {
        var def;
        if (typeof cmd === 'string') {
            def = Q.defer();
            def.command = cmd;
            // check if the encryption type is okay for both the socket and cmd
            def.encryptionType = this._checkEncryptionTypeForSocket(this._isDownloadSocket, encryptionType, cmd);
        } else {
            def = cmd;
        }
        return def;
    };

    /**
     * we have to determine if we can send the command at this point:
     * on normal socket, we only have one queue. DL Socket has 2, and all "download" commands must be queued in the waitingQueue
     * all commands during authentication can be sent directly.
     * @param cmd
     * @returns {*}
     * @private
     */
    WebSocket.prototype._isSocketReadyForCmd = function _isSocketReadyForCmd(cmd) {
        var socketReadyToGo = this._ws && this._ws.socketOpened;
        if (this._isDownloadSocket) {
            socketReadyToGo = socketReadyToGo &&
                (!this._socketPromise ||      // no this._socketPromise means at this point that the socket is ready (authenticated)!
                    cmd.startsWith(Commands.GET_KEY) ||
                    cmd.startsWith(Commands.format(Commands.AUTHENTICATE, "")) ||
                    cmd.startsWith(Commands.format(Commands.ENCRYPTION.KEY_EXCHANGE, "")) ||
                    cmd.startsWith(Commands.format(Commands.ENCRYPTION.AUTHENTICATE, "")) ||
                    this._isTokenAuthCmd(cmd));
        }
        return socketReadyToGo;
    };

    /**
     * True if the command is either used to authenticate with a token or to acquire a token.
     * @param cmd
     * @returns {boolean}
     * @private
     */
    WebSocket.prototype._isTokenAuthCmd = function _isTokenAuthCmd(cmd) {
        var isTokenAuth = false;
        isTokenAuth |= cmd.startsWith(Commands.format(Commands.TOKEN.GET_USERSALT, ""));
        isTokenAuth |= cmd.startsWith(Commands.TOKEN.GET_TOKEN_ID);
        isTokenAuth |= cmd.startsWith(Commands.TOKEN.AUTHENTICATE_ID);
        return isTokenAuth;
    };

    /**
     * Will encrypt the command and insert it into the proper encrypted command (fenc or enc) based on the encryptionType
     * @param cmd
     * @param encryptionType
     * @returns {*|string}
     */
    WebSocket.prototype._getEncryptedCommand = function _getEncryptedCommand(cmd, encryptionType) {
        var salt = this._encryption.salt,
            newSalt,
            useNextSalt = salt && ((Date.now() - this._encryption.saltTimestamp) >= (60 * 60 * 1000)); // change salt every hour

        var plaintext = "";
        if (salt && useNextSalt) {
            newSalt = CryptoAdapter.generateSalt();
            plaintext = Commands.format(Commands.ENCRYPTION.AES_NEXT_SALT, this._encryption.salt, newSalt, cmd);
            this._encryption.salt = newSalt;
            this._encryption.saltTimestamp = Date.now();

        } else {
            if (!salt) {
                this._encryption.salt = CryptoAdapter.generateSalt();
                this._encryption.saltTimestamp = Date.now();
                salt = this._encryption.salt;
            }
            plaintext = Commands.format(Commands.ENCRYPTION.AES_PAYLOAD, salt, cmd);
        }
        Debug.Encryption && console.log(this.name + "plaintext: " + plaintext);

        // AES encryption
        return CryptoAdapter.getLxAesEncryptedCmd(plaintext, this._encryption.key, this._encryption.iv, encryptionType);
    };

    WebSocket.prototype.download = function download(hostUrl, user, password, token, cmd, encryptionType) {
        if (this._isDownloadSocket) {
            Debug.DownloadSocketExt && console.log(this.name + "download '" + cmd + "'");

            // send now, the command will be put into the queue if the socket isn't opened yet..
            var promise = this.send(cmd, encryptionType);

            if (!this._socketPromise && (!this._ws || this._ws.socketClosed)) {
                Debug.DownloadSocketExt && console.log(this.name + "open socket");
                this.open(hostUrl, user, password, token).then(function() {
                    Debug.DownloadSocketExt && console.log(this.name + "socket ready, start requests");
                    this._requests = this._waitingQueue;
                    this._waitingQueue = [];
                    this._sendNextRequest();
                }.bind(this));
            }

            return promise;
        } else {
            throw new Error("WebSocket: socket is no DownloadSocket!");
        }
    };

    /**
     * Sends next request in the request Queue
     */
    WebSocket.prototype._sendNextRequest = function _sendNextRequest() {
        Debug.Socket.Detailed && console.log(this.name + "sendNextRequest");

        this._currentRequest = null;

        if (this._requests.length) {
            var def = this._requests.shift();
            this.send(def);
            Debug.Socket.Basic && console.info(this.name + "pending requests: " + this._requests.length);

        } else if (this._isDownloadSocket) {
            this._closingTimer = setTimeout(function closeAfterTimeout() {
                Debug.DownloadSocketExt && console.info(this.name + "closes after being", DLSOCKET_MAX_IDLE_TIME / 1000,
                    "seconds idle");
                this.close();
            }.bind(this), DLSOCKET_MAX_IDLE_TIME);
        }
    };

    /**
     * rejects pending commands after WebSocket did close
     * code SupportCode
     */
    WebSocket.prototype._resetRequestQueue = function _resetRequestQueue(code) {
        Debug.Socket.Basic && console.log(this.name + "resetRequestQueue");
        if (this._currentRequest) {
            this._currentRequest.reject(code);
            this._currentRequest = null;
        }

        while (this._requests.length) {
            var def = this._requests.shift();
            def.reject(code);
        }
    };

    /**
     * Handles errors of received messages
     * @param error
     * @param code
     */
    WebSocket.prototype._messageErrorHandler = function _messageErrorHandler(error, code) {
        this._currentRequest && this._currentRequest.reject(code);
    };

    /**
     * Handles response of the websocket, directs the data to the responsible handlers
     * @param text received from the websocket
     * @param type type of message
     */
    WebSocket.prototype._textMessageHandler = function _textMessageHandler(text, type) {
        if (this._isDownloadSocket) {
            Debug.DownloadSocketExt && console.info(this.name + "Miniserver -> App: " + text);
        } else {
            Debug.Socket.Basic && console.info(this.name + "Miniserver -> App: " + text);
        }

        if (type === BinaryEvent.Type.TEXT) {
            this._handleResponse(text);
        } else if (type === BinaryEvent.Type.FILE) {
            Debug.Socket.Detailed && console.info(this.name + "received file with text content!");
            this._handleFile(text);
        }
    };


    /**
     * handles binary messages from websocket
     * @param data binary data package
     * @param type of message
     */
    WebSocket.prototype._binaryMessageHandler = function _binaryMessageHandler(data, type) {
        try {
            switch (type) {
                case BinaryEvent.Type.TEXT:
                    this._handleBinaryText(data);
                    break;
                case BinaryEvent.Type.FILE:
                    Debug.Socket.Detailed && console.info(this.name + "received file with binary content!");
                    this._handleFile(data);
                    break;
                case BinaryEvent.Type.EVENT:
                case BinaryEvent.Type.EVENTTEXT:
                case BinaryEvent.Type.DAYTIMER:
                case BinaryEvent.Type.WEATHER:
                    this._handleBinaryEvent(data, type);
                    break;
                default:
                    console.warn(this.name + "unknown BinaryEvent type received (", type, ")");
                    break;
            }
        } catch (e) {
            console.error(e.stack);
        }
    };

    /**
     * Handles response of webservice requests
     * @param response as string
     * example:
     * {"LL":{"control":"dev/sps/version","value":"6.0.9.12","Code":"200"}}
     * must have a 'control', 'value' and 'Code' property!
     */
    WebSocket.prototype._handleResponse = function _handleResponse(response) {
        Debug.Socket.Detailed && console.info(this.name + "received response from request!");

        if (!this._currentRequest) {
            Debug.Socket.Basic && console.info(this.name + "received some response without request!");
            console.log(JSON.stringify(response));
            return;
        }

        response = this._decryptResponse(response, this._currentRequest.encryptionType);

        try {
            response = JSON.parse(response);
        } catch (e) {
            console.warn(this.name + "ERROR while parsing string: '" + response + "'");
            console.error(e.stack);

            response = this._recoverResponse(response);
            if (!response) { // recovering failed.
                this._currentRequest.reject(SupportCode.PARSING_MESSAGE_FAILED);
                return;
            }
        }

        // request decrypted and parsed, now handle it based on the response code.
        this._handleResponseByCode(response);
    };

    /**
     * Expects a parsed and decrypted request which will then be handled further based on the response code.
     * @param response
     * @private
     */
    WebSocket.prototype._handleResponseByCode = function _handleResponseByCode(response) {
        var code = getLxResponseCode(response);
        if (code >= 200 && code < 300) {            // ok
            this._currentRequest.resolve(response);
        } else if (code >= 300 && code < 400) {     // redirects
            this._currentRequest.reject(response);
        } else if (code >= 400 && code < 500) {     // client errors

            // usually this is being checked for inside the handleBadAuthResponse handler. But since on some devices, the
            // promises reject handler is called after the socket has already been closed - it is needed to be handled here.
            if (code === 401 && this._isAuthenticating()) {
                // a 401 while authenticating either means the password or the token are invalid.
                this._invalidToken = this._isAuthenticating(true);
                this._wrongPassword = !this._invalidToken; // if it's not due to an invalid token, it has to be due to a invalid pass!

                if (this._invalidToken) {
                    console.error(this.name + "401 returned during token based authentication");
                } else if (this._wrongPassword) {
                    console.error(this.name + "401 returned during password based authentication");
                } else {
                    console.error(this.name + "401 returned during authentication - nothing set.");
                }
            }

            this._currentRequest.reject(response);
        } else if (code >= 500 && code < 600) {     // server errors
            this._currentRequest.reject(response);
        } else if (code >= 600 && code < 1000) {    // proprietary errors
            this._currentRequest.reject(response);
        } else {
            this._currentRequest.reject(response);
        }
    };

    /**
     * Will check the responses encryption type and decrypt the response from the Miniserver if needed.
     * @param response  the fenc-response from the Miniserver
     * @param encryptionType    if full encryption was used, this method will decrypt it.
     * @returns {*}
     * @private
     */
    WebSocket.prototype._decryptResponse = function _decryptResponse(response, encryptionType) {
        if (encryptionType !== EncryptionType.REQUEST_RESPONSE_VAL) {
            // response not encrypted
            return response;
        }
        Debug.Encryption && console.log(this.name + "encrypted response: " + response);
        try {
            response = CryptoAdapter.aesDecrypt(response, this._encryption.key, this._encryption.iv);
            Debug.Encryption && console.log(this.name + "decrypted response: " + response);
        } catch (e) {
            console.error(e.stack);
            this._currentRequest.reject(SupportCode.DECRYPTING_RESPONSE_VALUE_FAILED);
            return;
        }
        return response;
    };

    /**
     * If parsing a response fails, this method is our backup that tries to retrieve the responses content manually
     * @param response
     * @returns {*}
     * @private
     */
    WebSocket.prototype._recoverResponse = function _recoverResponse(response) {
        // only try to parse, if 14 " are in string! otherwise it won't work probably
        if (occurrences(response, '"') !== 14) {
            // response cannot be recovered
            return null;
        }
        console.info(this.name + "trying to parse response manually!");

        var res = {
            LL: {}
        };
        /*
         "{"LL": { "control": "dev/sps/listcmds", "value": "2014-10-09 09:50:08 Alarm Česká zbrojovka/0a5fa3e5-0182-8541-ffff112233445566/10.000000", "Code": "200"}}
         "
         */
        //response = response.slice(21);
        response = response.slice(response.indexOf('"') + 1); // go first next property
        response = response.slice(response.indexOf('"') + 1);
        response = response.slice(response.indexOf('"') + 1);
        response = response.slice(response.indexOf('"') + 1);
        response = response.slice(response.indexOf('"') + 1);
        res.LL.control = response.slice(0, response.indexOf('"'));
        response = response.slice(response.indexOf('"') + 1); // go to next property
        response = response.slice(response.indexOf('"') + 1);
        response = response.slice(response.indexOf('"') + 1);
        response = response.slice(response.indexOf('"') + 1);
        res.LL.value = response.slice(0, response.indexOf('"'));
        response = response.slice(response.indexOf('"') + 1); // go to next property
        response = response.slice(response.indexOf('"') + 1);
        response = response.slice(response.indexOf('"') + 1);
        response = response.slice(response.indexOf('"') + 1);
        res.LL.Code = response.slice(0, response.indexOf('"'));

        return cloneObjectDeep(res); // stringify and parse again to be sure it went correct!
    };


    /**
     * Creates an event object from the received bytes and broadcast the result
     * @param data as byte array
     * @param type of binary event
     */
    WebSocket.prototype._handleBinaryEvent = function _handleBinaryEvent(data, type) {
        Debug.Socket.Detailed && console.log(this.name + "handleBinaryEvent");
        var msg = new BinaryEvent(data, type);

        this._config.delegate.socketOnEventReceived && this._config.delegate.socketOnEventReceived(this, msg.events, type);
    };


    /**
     * handles a received file
     * @param file (can be binary data or a string)
     */
    WebSocket.prototype._handleFile = function _handleFile(file) {
        Debug.Socket.Detailed && console.log(this.name + "handleFile");
        if (this._currentRequest) {
            this._currentRequest.resolve(file);
        } else {
            console.error(this.name + "ERROR: received unexpected file!");
        }
    };


    /**
     * Handles binary texts, if miniserver sends some -> should be changed to a Websocket-Text-Message after RFC6455!
     * @param data as byte array
     * DEPRECATED! only here to be able to find mistakes from Miniserver :)
     */
    WebSocket.prototype._handleBinaryText = function _handleBinaryText(data) {
        Debug.Socket.Detailed && console.log(this.name + "handleBinaryText");
        console.error(this.name + "ERROR: received binary text: " + arrayBufferToString(data));
        console.info("  please file a bugreport");
    };

    /**
     * determines if the encryptionType is actually telling that we should use encryption
     * @param encryptionType
     * @returns {boolean}
     */
    WebSocket.prototype._usesEncryption = function _usesEncryption(encryptionType) {
        return encryptionType === EncryptionType.REQUEST || encryptionType === EncryptionType.REQUEST_RESPONSE_VAL;
    };

    /**
     * checks the encryption type for the given command
     * depends on whether it is the download socket, the reachmode, config version, and the command itself
     * @param isDownloadSocket
     * @param encryptionType
     * @param command
     * @returns {EncryptionType}
     */
    WebSocket.prototype._checkEncryptionTypeForSocket = function _checkEncryptionTypeForSocket(isDownloadSocket, encryptionType, command) {
        // force encryption if we are remote connected (but don't override it if we use the encryptionType parameter)
        if (!this._isDownloadSocket &&    // not on DLSocket!
            (typeof encryptionType === "undefined" || encryptionType === null) &&
                // TODO-goelzda Handle reachability
            //CommunicationComponent.getCurrentReachMode() === ReachMode.REMOTE &&
            FeatureCheck.check(FeatureCheck.feature.ENCRYPTED_CONNECTION_FULLY)) {
            encryptionType = EncryptionType.REQUEST;
        } else {
            encryptionType = encryptionType || EncryptionType.NONE;
        }

        if (!FeatureCheck.check(FeatureCheck.feature.ENCRYPTED_CONNECTION_FULLY) &&
            encryptionType === EncryptionType.REQUEST_RESPONSE_VAL) {
            encryptionType = EncryptionType.REQUEST;
        }

        if (command) { // command is null when called from checkEncryptionTypeForHttp
            // now check if the command is supported encrypted from the Miniserver
            command = command.toLowerCase();
            if (encryptionType === EncryptionType.REQUEST || encryptionType === EncryptionType.REQUEST_RESPONSE_VAL) {
                if (command.indexOf("data/loxapp3.json") !== -1 ||
                    command.indexOf("statistics.json") !== -1 ||
                    command.indexOf("binstatisticdata") !== -1 ||
                    command.indexOf(".png") !== -1 ||
                    command.indexOf(".svg") !== -1 ||
                    command.indexOf("camimage") !== -1) {
                    encryptionType = EncryptionType.NONE;
                }
            }
            if (encryptionType === EncryptionType.REQUEST_RESPONSE_VAL) {
                // nothing known so far (would fall back to EncryptionType.REQUEST)
            }
        }

        return encryptionType;
    };

    /**
     * Resolves the given url to the the IP address of the Miniserver or to the HTTPS dyndns url of the Miniserver Generation 2 if applicable
     * @param url Can be internal or external IP, CloudDNS URL or Custom URL
     * @private
     */
    WebSocket.prototype._resolveHost = function _resolveHost(url) {
        var isOldDNS,
            isNewDNS,
            isLxCloudDNS= false,
            cloudDNSIndex = url.replace(/^http[s]*:\/\//).indexOf("dns.loxonecloud.com");
            isOldDNS = cloudDNSIndex === 0;    // Like dns.loxonecloud.com/{serialNo}
            isNewDNS = cloudDNSIndex === 13;    // Like {serialNo}.dns.loxonecloud.com

        isLxCloudDNS = isOldDNS || isNewDNS;

        // Add a trailing slash if missing for later command concatenation
        if (!url.hasSuffix("/")) {
            url += "/";
        }

        // Ensure the URL contains a protocol
        if (url.indexOf("http://") === -1 && url.indexOf("https://") === -1) {
            if (this._config.protocol === WebSocketConfig.protocol.WS) {
                url = "http://" + url;
            } else {
                url = "https://" + url;
            }
        }

        // The Loxone Cloud DNS only accepts the "http" protocol, it will automatically redirect to the "https" url if applicable
        if (isLxCloudDNS) {
            url = url.replace("https://", "http://");
        }

        return $.ajax({
            url: url + Commands.GET_API_KEY,
            dataType: "json"
        }).then(function(result) {
            var resolvedHost,
                value;

            // Follow Redirect
            // There is a difference on how to get the responseUrl in Node.js and in the Browser
            if (result.request.res) {
                resolvedHost = result.request.res.responseUrl;
            } else {
                resolvedHost = result.request.responseURL;
            }

            resolvedHost = resolvedHost.replace(Commands.GET_API_KEY, "");

            if (typeof result.data === "string") {
                result.data = JSON.parse(result.data);
            }

            try {
                value = JSON.parse(result.data.LL.value.replace(/\'/g, '"'));
            } catch (ex) {
                value = result.data.LL.value;
            }

            if (!FeatureCheck.hasCurrentVersion()) {
                FeatureCheck.setCurrentVersion(value.version);
            }
            // Manually set the communication protocol according to the httpsStatus property of the response
            if (isLxCloudDNS && value.httpsStatus === 1) {
                this._config._protocol = WebSocketConfig.protocol.WSS;
            }

            return resolvedHost;
        }.bind(this));
    };

    //////////////////////////////////////////////////////////////////////
    module.exports = WebSocket;
    //////////////////////////////////////////////////////////////////////
}).call(this);
