(function() {
    var MAX_REFRESH_DELAY = 1000 * 60 * 60 * 24;    // = 1 Day

    // Require and check for any modules
    //////////////////////////////////////////////////////////////////////

    var Q = require('q'),
        moment = require('moment'),
        WebSocketConfig = require('./WebSocketConfig'),
        SupportCode = require('../vendor/SupportCode'),
        Commands = require('../vendor/Commands'),
        FeatureCheck = require('../vendor/FeatureCheck'),
        CryptoAdapter = require('../vendor/CryptoAdapter'),
        Debug = require('../vendor/Debug'),
        EncryptionType = require('../vendor/EncryptionType'),
        Utils = require('../vendor/Utils'); // <- This adds some global functions

        //////////////////////////////////////////////////////////////////////

    var TokenHandler = function TokenHandler(communicatorModule, deviceId, deviceInfo, tokenDidRefresh) {
        var tokenMap = {};

        return {

            // Name is used for debug output
            name: "TokenHandler",

            /**
             * Will try to acquire a token for this user with this password. When the returned promise resolves, it will
             * provide an object containing both the acquired token and a oneTimeSalt.
             * @param user
             * @param password
             * @param msPermission     the permission that token needs to grant.
             * @returns {*} a promise that resolves with an object containing the token and a oneTimeSalt
             */
            requestToken: function requestToken(user, password, msPermission) {
                Debug.Tokens && console.log(this.name, "requestToken: " + user + " - Perm: " + this._translPerm(msPermission));
                var cmd, pwHash, hash, tkObj,
                    resValue;

                return this._requestUserSalt(user).then(function(saltObj) {

                    // create a SHA1 or SHA256 hash of the (salted) password
                    pwHash = CryptoAdapter[saltObj.hashAlg](password + ":" + saltObj.salt);
                    pwHash = pwHash.toUpperCase();

                    // hash with user and otSalt
                    hash = this._otHash(user + ":" + pwHash, saltObj.oneTimeSalt, saltObj.hashAlg);

                    // create the getToken cmd
                    cmd = Commands.format(this._getGetTokenCommand(), hash, user, msPermission, deviceId, deviceInfo);
                    Debug.Tokens && console.log("   request a token: " + cmd);

                    return communicatorModule.send(cmd, EncryptionType.REQUEST_RESPONSE_VAL).then(function(tResult) {
                        resValue = getLxResponseValue(tResult);
                        Debug.Tokens && console.log("    token received! perm: " + this._translPerm(resValue.tokenRights));
                        tkObj = this._prepareTokenObj(resValue, user);

                        // store in this extension. so it can be kept alive & so on.
                        this._storeTokenObj(tkObj);

                        // put key (otSalt) onto the result object.
                        tkObj.key = resValue.key;

                        return tkObj;

                    }.bind(this), function (err) {
                        var errObj = { user: user };
                        try {
                            errObj.code = getLxResponseCode(err);
                            errObj.value = getLxResponseValue(err);
                        } catch (ex) {
                            errObj.value = err;
                            errObj.code = 0;
                        }
                        console.error("Could not acquire a token! " + JSON.stringify(errObj));
                        throw errObj; // forward so the error can be handled on the outside.
                    });
                }.bind(this));
            },

            /**
             * This method is called before the communication to a new Miniserver is established.
             */
            reset: function reset() {
                Debug.Tokens && console.log(this.name, "reset");
                this._stopAllKeepAlives();
                tokenMap = {};
            },

            /**
             * Will look a token with a specific permission from the handled tokens.
             * @param msPermission     what permission the token needs to grant
             * @param [user]        optional. can be specified that the token needs to be from a specific user.
             * @returns {*}         an object containing the token, the user, the rights and so on.
             */
            getToken: function getToken(msPermission, user) {
                Debug.Tokens && console.log(this.name, "getToken: permission " + this._translPerm(msPermission) + " for " + user);
                var token = null;
                Object.values(tokenMap).some(function (tokenObj) {
                    if (hasBit(tokenObj.msPermission, msPermission) && (!user || user === tokenObj.username)) {
                        token = tokenObj;
                    }
                    return token !== null;
                });
                Debug.Tokens && console.log("       token found: " + (token !== null));
                return token;
            },

            /**
             * Will resolve if a valid token exists & reject if no token exists or the token isn't valid.
             * @param msPermission  the permission we want
             * @param username      the user for which we need to have the token.
             */
            getVerifiedToken: function getVerifiedToken(msPermission, username) {
                var tokenObj = this.getToken(msPermission, username),
                    promise;

                if (tokenObj) {
                    promise = this._checkOrRefreshToken(tokenObj).then(function (res) {
                        Debug.Tokens && console.log("  token is verified  " + this._translPerm(msPermission) + " for " + username + " is verified");
                        return tokenObj.token;
                    }.bind(this), function (err) {
                        this._killToken(tokenObj.token, tokenObj.username);
                        throw new Error(err);
                    }.bind(this));
                } else {
                    promise = prmsfy(false, null, new Error("No token!"));
                }
                return promise;
            },

            /**
             * Will lookup the token granting the permission provided and then ensures that this token will be kept alive
             * until killToken is called on the msPermission or the keepalive has been stopped.
             * @param msPermission         the permission of the token that is to be kept alive
             */
            keepPermissionTokenAlive: function keepPermissionTokenAlive(msPermission) {
                Debug.Tokens && console.log(this.name, "keepPermissionTokenAlive: " + this._translPerm(msPermission));
                var storedObj = this.getToken(msPermission);
                if (storedObj) {
                    this._stopKeepAlive(storedObj, msPermission);
                    this._startKeepAlive(storedObj, msPermission);
                } else {
                    console.error("Cannot keep a a token alive who's data is not known.");
                }
            },

            /**
             * Will stop the keepalive for the token with this permission. It will not stop all keepalives for this token,
             * only the one that has beens tarted for this very permission (-combination)
             * @param msPermission
             */
            stopMsPermissionKeepAlive: function stopMsPermissionKeepAlive(msPermission) {
                Debug.Tokens && console.log(this.name, "stopMsPermissionKeepAlive: " + this._translPerm(msPermission));
                var storedObj = this.getToken(msPermission);
                if (storedObj) {
                    this._stopKeepAlive(storedObj, msPermission);
                } else {
                    console.error("Cannot stop a tokens keepalive who's data is not known.")
                }
            },

            /**
             * ensure the token is no longer kept alive by this extension
             * @param token
             */
            removeFromKeepAlive: function removeFromKeepAlive(token) {
                if (this._tokenIsKeptAlive(token)) {
                    this._stopKeepAlive(this._getTokenObj(token));
                }
            },

            /**
             * Will iterate and kill all tokens that are being handled in here.
             */
            killAllTokens: function killAllTokens() {
                Debug.Tokens && console.log(this.name, "killAllTokens");
                var prmses = [],
                    connToken;

                // important - clone, otherwise the map would be mutated while being iterated
                cloneObject(Object.values(tokenMap)).forEach(function (tkObj) {

                    // kill the connection token last, otherwise the other tokens cannot be killed (socket closes)
                    if (this._isConnectionToken(tkObj)) {
                        connToken = tkObj;
                    } else {
                        prmses.push(this._killToken(tkObj.token, tkObj.username));
                    }
                }.bind(this));

                // the other tokens have already been killed. kill this one too.
                connToken && prmses.push(this._killToken(connToken.token, connToken.username));

                return Q.all(prmses);
            },

            /**
             * Wills a token with an optional username passed in, but with a known token permission. If no token exists,
             * it won't do anything.
             * @param msPermission
             * @param [username]    if not provided, the extension will look up the user stored for this token
             */
            killTokenWithMsPermission: function killTokenWithMsPermission(msPermission, username) {
                Debug.Tokens && console.log(this.name, "killTokenWithMsPermission: " + this._translPerm(msPermission));
                var tokenObj = this.getToken(msPermission, username);

                // check if the token to kill is the connection token, only kill it if the permission specifically requests it.
                if (tokenObj && (!this._isConnectionToken(tokenObj) || this._hasConnectionPermission(msPermission))) {
                    this._killToken(tokenObj.token, tokenObj.username);
                } else if (tokenObj) {
                    Debug.Tokens && console.info("Won't kill the token, perms : " + this._translPerm(tokenObj.msPermission));
                } else {
                    Debug.Tokens && console.info("No token to kill");
                }
            },

            /**
             * Sends the command via the websocket, but adds the token provided as additional authentication to the
             * command. E.g. used to edit users or to use the expert mode.
             * @param cmd
             * @param token
             * @param user
             * @param [oneTimeSalt] optional oneTimeSalt, requested if not already provided.
             * @result {Promise}
             */
            sendWithToken: function sendWithToken(cmd, token, user, oneTimeSalt) {
                var saltPrms,
                    authCmd = cmd;

                if (oneTimeSalt) {
                    saltPrms = Q.fcall(function() { return oneTimeSalt; });
                } else {
                    saltPrms = this._getOneTimeSalt();
                }

                return saltPrms.then(function (otSalt) {
                    authCmd += "?" + Commands.format(Commands.TOKEN.AUTH_ARG, this._otHash(token, otSalt), user);
                    return communicatorModule.send(cmd, EncryptionType.REQUEST_RESPONSE_VAL);
                }.bind(this), function (err) {
                    console.error("Could not launch the cmd " + cmd + " for user " + user + "! " + JSON.stringify(err));
                    throw new Error(err);
                });
            },

            /**
             * This method is called after successfully logging in with an existing token. The token will then be auto-
             * matically kept alive for the time being.
             * @param tokenObj      the token object that has been acquired (including user, permission/rights)
             * @param user          what user was this token for?
             * @returns {{token: *, msPermission: *, username: *, validUntil: *}}
             */
            addToHandledTokens: function addToHandledTokens(tokenObj, user) {
                var obj = this._prepareTokenObj(tokenObj, user);
                this._storeTokenObj(obj);
                this.keepPermissionTokenAlive(obj.msPermission);
                return obj;
            },

            /**
             * Will check if the token provided has got the "insecure password" flag set. As now we no longer know if
             * a password is insecure or not as we don't store the password anymore - the Miniserver knows if it's insecure
             * and will publish this info along with the token.
             * @param token
             */
            hasInsecurePassword: function hasInsecurePassword(token) {
                var tokenObj = this._getTokenObj(token);
                return tokenObj && !!tokenObj.unsecurePass;
            },

            /**
             * When the password of the active user was changed, all tokens except for the active connection token will
             * be invalidated and therefore can be removed. The active communication token (App or Web) will be kept alive
             * and have to be refreshed as the unsafePassword flag needs to be updated.
             */
            respondToPasswordChange: function respondToPasswordChange() {
                Debug.Tokens && console.log(this.name, "respondToPasswordChange");
                // store a reference to the connection token. it will be reused later
                var connToken = this.getToken(WebSocketConfig.permission.APP) || this.getToken(WebSocketConfig.permission.WEB);

                // stop keepalives & reset the token map (= removes all other tokens)
                this.reset();

                // delete all attributes that will be reassigned when the token is refreshed
                delete connToken.seconds;
                delete connToken.validUntil;
                delete connToken.unsecurePass;

                // launch refresh right away to ensure the attributes (especially unsafePassword) are updated.
                return this._refreshToken(connToken).then(function (res) {
                    Debug.Tokens && console.log(this.name, "successfully refreshed after password change.");
                    if (FeatureCheck.check(FeatureCheck.feature.TOKEN_REFRESH_AND_CHECK)) {
                        this._storeNewConnectionToken(connToken, res);
                    } else {
                        updateObject(connToken, res); // store the new attributes (unsecurePass, validUntil & seconds)
                        this.addToHandledTokens(connToken, connToken.username);
                    }
                }.bind(this));
            },

            /**
             * After calling this method, the token provided will no longer be valid. All clients using it loose their
             * access rights.
             * @param token     the token that is to be killed
             * @param username  the user whom the token belongs to.
             * @returns {*}
             */
            _killToken: function _killToken(token, username) {
                this.removeFromKeepAlive(token);
                if (!username) {
                    username = tokenMap[token].username;
                }
                this._deleteToken(token);
                return this._sendTokenCommand(Commands.TOKEN.KILL, token, username).fail(function (err) {
                    if (err === SupportCode.WEBSOCKET_CLOSE) {
                        Debug.Tokens && console.log(this.name, "   Connection Token killed, socket closed!");
                    } else if (err && err.LL) {
                        console.warn("Kill Token command failed. It might already be dead by now! " + JSON.stringify(err));
                    } else {
                        console.warn("Connection issue while killing the token. " + JSON.stringify(err));
                    }
                }.bind(this));
            },

            /**
             * Will ask the Miniserver whether or not the token is still valid. Resolves if it is, rejects if it's not.
             * @param tokenObj
             * @return {*}
             * @private
             */
            _checkToken: function _checkToken(tokenObj) {
                Debug.Tokens && console.log(this.name, "_checkToken: " + tokenObj.username + " - Perm: " + this._translPerm(tokenObj.msPermission));

                return this._sendTokenCommand(Commands.TOKEN.CHECK, tokenObj.token, tokenObj.username).then(function(result) {
                    Debug.Tokens && console.log("Check for token succeeded!");
                    return getLxResponseValue(result);
                }.bind(this), function (err) {
                    console.error("Check for token " + tokenObj.username + " with permission " + this._translPerm(tokenObj.msPermission) + " failed!");
                    console.error(JSON.stringify(err));
                    throw err;
                }.bind(this));
            },

            /**
             * Will expand the tokens lifespan. When the promise resolves, it returns an object that contains the infor
             * until when the token will be valid both as seconds since 1.1.2009 and as date object.
             * @param tokenObj
             * @returns {*}     promise that resolves with an object that contains how long the token will be valid
             */
            _refreshToken: function _refreshToken(tokenObj) {
                Debug.Tokens && console.log(this.name, "_refreshToken: " + tokenObj.username + " - Perm: " + this._translPerm(tokenObj.msPermission));

                return this._sendTokenCommand(this._getRefreshCommand(), tokenObj.token, tokenObj.username).then(function(result) {
                    return getLxResponseValue(result);
                }.bind(this), function (err) {
                    console.error("Could not refresh the token of '" + tokenObj.username + "' with permission + " + this._translPerm(tokenObj.msPermission));
                    console.error(JSON.stringify(err));
                    throw err;
                }.bind(this));
            },

            _checkOrRefreshToken: function _checkOrRefreshToken(tokenObj) {
                Debug.Tokens && console.log(this.name, "_checkOrRefreshToken: " + JSON.stringify(tokenObj));
                if (FeatureCheck.check(FeatureCheck.feature.TOKEN_REFRESH_AND_CHECK)) {
                    return this._checkToken(tokenObj);
                } else {
                    return this._refreshToken(tokenObj);
                }
            },

            /**
             * Will transfer all the attributes needed from the old to the new object & then dispatch it in order to be
             * kept alive, stored, updated inside other components and persisted to the filesystem.
             * @param oldTokenObj
             * @param newTokenObj
             * @private
             */
            _storeNewConnectionToken: function _storeNewConnectionToken(oldTokenObj, newTokenObj) {
                Debug.Tokens && console.log(this.name, "_storeNewConnectionToken: " + oldTokenObj.username);

                // ensure all necessary information is available.
                newTokenObj.username = oldTokenObj.username;
                newTokenObj.msPermission = oldTokenObj.msPermission;
                newTokenObj.tokenRights = oldTokenObj.tokenRights;

                // emit to ensure it is persisted too.
                tokenDidRefresh && tokenDidRefresh(newTokenObj);
            },

            /**
             * Will send a token cmd to the Miniserver (e.g. refresh or kill)
             * @param cmd       the command to send
             * @param token     the token to send it for (will be oneTime-Hashed)
             * @param username  the user for which to send the command.
             * @param addArg0   optional, additional argument for the command
             * @private
             */
            _sendTokenCommand: function _sendTokenCommand(cmd, token, username, addArg0) {
                Debug.Tokens && console.log(this.name, "_sendTokenCommand: " + cmd);
                var fullCmd;
                return communicatorModule.getSaltedHash(token).then(function(hash) {
                    fullCmd = Commands.format(cmd, hash, username, addArg0);
                    return communicatorModule.send(fullCmd, EncryptionType.REQUEST_RESPONSE_VAL).then(function(result) {
                        Debug.Tokens && console.log(this.name, "   TokenCommand succeeded! " + cmd);
                        return result;
                    }.bind(this), function (err) {
                        console.error(this.name, "   TokenCommand failed! " + cmd);
                        throw err; // the error should be handled outside too!
                    }.bind(this));
                }.bind(this));
            },

            /**
             * Will return a valid oneTimeSalt when it resolves.
             * @private
             */
            _getOneTimeSalt: function _getOneTimeSalt() {
                return communicatorModule.send(Commands.GET_KEY).then(function(res) {
                    return getLxResponseValue(res, true);
                });
            },

            /**
             * Will request a salt object containing both the salt for the user and a oneTimeSalt too.
             * @param user      for whom this salt is to be requested
             * @private
             */
            _requestUserSalt: function _requestUserSalt(user) {
                var cmd = Commands.format(Commands.TOKEN.GET_USERSALT, user);
                return communicatorModule.send(cmd, EncryptionType.REQUEST_RESPONSE_VAL).then(function(result) {
                    return {
                        oneTimeSalt: result.LL.value.key,
                        salt: result.LL.value.salt,
                        hashAlg: result.LL.value.hashAlg || CryptoAdapter.HASH_ALGORITHM.SHA1
                    };
                });
            },

            /**
             * Helper method that will create a oneTimeHash (HmacSHA1 or HmacSHA256) of the payload using the oneTimeSalt provided.
             * @param payload       the payload to hash
             * @param oneTimeSalt   the onetime salt to use for the HmacSHA1 or HmacSHA256
             * @param [hashAlg]     the hashing algorithm to be used
             * @returns {string|*}
             * @private
             */
            _otHash: function _otHash(payload, oneTimeSalt, hashAlg) {
                hashAlg = hashAlg || CryptoAdapter.HASH_ALGORITHM.SHA1;
                return CryptoAdapter["Hmac" + hashAlg](payload, "utf8", oneTimeSalt, "hex", "hex");
            },

            /**
             * Will ensure that the token passed in using the tokenObject will not be invalidated due to a timeout
             * @param tokenObj
             * @param msPermission
             * @private
             */
            _startKeepAlive: function _startKeepAlive(tokenObj, msPermission) {
                // The Miniserver time origin is the first of January 2019
                var expireDate = moment.utc([2009, 0, 1, 0, 0, 0]).add(tokenObj.validUntil, "seconds"),
                    currDate = moment(),
                    delta = expireDate - currDate;
                Debug.Tokens && console.log(this.name, "_startKeepAlive: " + this._translPerm(msPermission));

                if (delta < 0 || !tokenObj.validUntil || isNaN(delta)) {
                    // token lifespan unknown or negative, try to refresh right away!
                    delta = 500;
                }

                // refresh it at least every day. BTW: the interval mustn't exceed the integer max, otherwise it will fire repeatedly
                delta = Math.min(delta * 0.9, MAX_REFRESH_DELAY);

                if (!msPermission) {
                    msPermission = 0;
                }
                if (!tokenObj.timeouts) {
                    tokenObj.timeouts = {};
                }

                tokenObj.timeouts[msPermission] = setTimeout(this._keepAliveFired.bind(this, tokenObj, msPermission), delta);
            },

            _keepAliveFired: function _keepAliveFired(tokenObj, msPermission) {
                Debug.Tokens && console.log(this.name, "_keepAliveFired");

                delete tokenObj.timeouts[msPermission];

                this._refreshToken(tokenObj).then(function(res) {

                    if (FeatureCheck.check(FeatureCheck.feature.TOKEN_REFRESH_AND_CHECK)) {
                        // ensure the old token is no longer around.
                        this._deleteToken(tokenObj.token);

                        // ensure the new one is properly stored.
                        if (this._isConnectionToken(tokenObj)) {
                            // connection tokens need to be persisted, which is done by the CommComp.
                            this._storeNewConnectionToken(tokenObj, res);
                        } else {
                            res.msPermission = tokenObj.msPermission;
                            res.username = tokenObj.username;
                            this._storeTokenObj(res);
                            this._startKeepAlive(res, msPermission);
                        }
                    } else {
                        this._startKeepAlive(tokenObj, msPermission);
                    }
                }.bind(this), function (err) {
                    this._handleRefreshFailed(tokenObj, err);
                }.bind(this))
            },

            /**
             * Called when the token refresh command has failed.
             * @param tokenObj  the token obj for whom the refresh failed
             * @param err       the error that lead to the failing refresh
             * @private
             */
            _handleRefreshFailed: function _handleRefreshFailed(tokenObj, err) {
                // ensure the token is really invalid and it's not a connection error!
                if (err && err.LL) {
                    console.error("Invalid/Outdated token - kill it!");
                    this._killToken(tokenObj.token, tokenObj.username);
                } else {
                    console.warn("Connection issue (" + JSON.stringify(err) + ") during token refresh. Don't kill it");
                }
            },

            /**
             * Starts or stops the timeout of a specific permission of a token.
             * @param tokenObj      the token whos keepalive is to be stopped
             * @param msPermission  only stop the keepalive of that very permission.
             * @private
             */
            _stopKeepAlive: function _stopKeepAlive(tokenObj, msPermission) {
                var timeout;
                if (!msPermission) {
                    msPermission = 0;
                }
                Debug.Tokens && console.log(this.name, "_stopKeepAlive: " + this._translPerm(msPermission));

                if (tokenObj.timeouts) {

                    timeout = tokenObj.timeouts[msPermission];
                    timeout && clearTimeout(timeout);
                    delete tokenObj.timeouts[msPermission];
                }
            },

            _stopAllKeepAlives: function _stopAllKeepAlives() {
                Debug.Tokens && console.log(this.name, "_stopAllKeepAlives");
                Object.values(tokenMap).forEach(function (tokenObj) {
                    Object.values(tokenObj.timeouts).forEach(clearTimeout);
                    tokenObj.timeouts = null;
                }.bind(this));
            },

            /**
             * Ensures the object provided has the minimum set of attributes (token, user, permission), then stores it
             * in the tokenMap.
             * @param tokenObj
             * @return {*|{username: *, token: *, validUntil: *, msPermission: *}}
             * @private
             */
            _storeTokenObj: function _storeTokenObj(tokenObj) {
                Debug.Tokens && console.log(this.name, "_storeTokenObj: usr=" + tokenObj.username + ", perm=" +
                    this._translPerm(tokenObj.msPermission));

                // ensure the token objects data is okay
                var stored = this._prepareTokenObj(tokenObj);
                tokenMap[tokenObj.token] = stored;

                return stored;
            },

            /**
             * Looks up a token object based on the token itself
             * @param token
             * @returns {*}
             * @private
             */
            _getTokenObj: function _getTokenObj(token) {
                return tokenMap[token];
            },

            /**
             * Deletes the token from this extensions dataset (does not kill it or invalidate any timers)
             * @param token
             * @private
             */
            _deleteToken: function _deleteToken(token) {
                delete tokenMap[token];
            },

            /**
             * Returns true if the token is currently being kept alive.
             * @param token         the token in question
             * @returns {boolean}
             * @private
             */
            _tokenIsKeptAlive: function _tokenIsKeptAlive(token) {
                var tokenObj = this._getTokenObj(token);
                return tokenObj && tokenObj.timeout;
            },

            /**
             * Will check if the tkObj provided is the one that keeps the socket connection alive.
             * @param tkObj
             * @returns {boolean}
             * @private
             */
            _isConnectionToken: function _isConnectionToken(tkObj) {
                Debug.Tokens && console.log(this.name, "_isConnectionToken: " + this._translPerm(tkObj.msPermission));
                return this._hasConnectionPermission(tkObj.msPermission);
            },

            /**
             * Returns true if the permission provided contains the connection permission.
             * @param msPermission
             * @returns {boolean}
             * @private
             */
            _hasConnectionPermission: function _hasConnectionPermission(msPermission) {
                var res = false;
                res = res || hasBit(msPermission, WebSocketConfig.permission.WEB);
                res = res || hasBit(msPermission, WebSocketConfig.permission.APP);
                return res;
            },

            /**
             * Returns a string containing the userfriendly names of all the different permissions that are set in perm.
             * @param perm
             * @returns {string}
             * @private
             */
            _translPerm: function _translPerm(perm) {
                var perms = [];

                Object.keys(WebSocketConfig.permission).forEach(function (key) {
                    if (hasBit(perm, WebSocketConfig.permission[key])) {
                        perms.push(key);
                    }
                });
                return perms.join(", ");
            },

            /**
             * Calling this method ensures that the token object that is being returned contains all data needed for a
             * token. It will not reuse any other data provided by the input object that is not needed for a tokenObj.
             * @param inputObj      the input obj (e.g. as returned by the Miniserver)
             * @param [username]    optional, may also be contained in the inputObj.
             * @returns {{ username: *, token: *, validUntil: *, msPermission: * }}
             * @private
             */
            _prepareTokenObj: function _prepareTokenObj(inputObj, username) {
                var tkObj = inputObj;

                tkObj.username = inputObj.username ? inputObj.username : username;
                tkObj.msPermission = inputObj.msPermission ? inputObj.msPermission : inputObj.tokenRights;

                if (!tkObj.token || !tkObj.msPermission || !tkObj.username) {
                    throw new Error("This token object is not valid!");
                }

                return tkObj;
            },

            /**
             * Returns the right getToken command, as new Miniservers support a separate command for JWT & legacy tokens
             * @return {string}
             * @private
             */
            _getGetTokenCommand: function _getGetTokenCommand() {
                return FeatureCheck.check(FeatureCheck.feature.JWT_SUPPORT) ? Commands.TOKEN.GET_JWT_TOKEN : Commands.TOKEN.GET_TOKEN;
            },

            /**
             * Returns the proper refresh command, as new Miniservers support a separate command for JWT & legacy tokens
             * @return {string}
             * @private
             */
            _getRefreshCommand: function _getRefreshCommand() {
                return FeatureCheck.check(FeatureCheck.feature.JWT_SUPPORT)  ? Commands.TOKEN.REFRESH_JWT : Commands.TOKEN.REFRESH;
            }
        }
    };

    //////////////////////////////////////////////////////////////////////
    module.exports = TokenHandler;
    //////////////////////////////////////////////////////////////////////
}).call(this);
