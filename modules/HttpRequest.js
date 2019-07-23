'use strict';

(function() {

    // Require and check for any modules
    //////////////////////////////////////////////////////////////////////

    var $ = require('../vendor/JqueryWrapper'),
        CryptoJS = require('crypto-js'),
        CryptoAdapter = require('../vendor/CryptoAdapter'),
        JSEncryptWrapper = require('node-jsencrypt'),
        FeatureCheck = require('../vendor/FeatureCheck'),
        Commands = require('../vendor/Commands'),
        DEBUG = require('../vendor/Debug').HttpRequest;

    //////////////////////////////////////////////////////////////////////

    /**
     * Handles all HTTP communication with the Miniserver
     * @constructor
     */
    var HttpRequest = function lxHttpRequest() {
        var _public_key;

        return {
            /**
             * Types of supported tokens
             * SHORT_LIVED: Should be used for WebApplications
             * LONG_LIVED: Should be used for native Applications
             * @type {{SHORT_LIVED: number, LONG_LIVED: number}}
             */
            TOKEN_TYPES: {
                SHORT_LIVED: 2,
                LONG_LIVED: 3
            },

            /**
             * Launches an http request to the URL provided. The (hashed) authentication has to be provided via data if needed.
             * @param url
             * @param cmd
             * @param data  json object with arguments that will be added to the request
             * @param rawResponse   checkResponse won't be called on the rsp if this is true.
             * @result {Promise}    a promise that resolves with the result
             */
            request: function request(url, cmd, data, rawResponse) {
                var rq = {
                    url: url + cmd,
                    data: data,
                    dataType: rawResponse ? "html" : "json",
                    cache: false
                }, res, ajax;

                DEBUG && console.log("App -> Miniserver: " + cmd);
                ajax = $.ajax(rq);
                res = ajax.then(function (response) {
                    DEBUG && console.log("Miniserver -> App: " + JSON.stringify(response.data));
                    return response.data;
                });

                // ajax.error is only needed and defined in the browser
                if (ajax.error) {
                    // This prevents the browser to show the authentication popup if 401 is returned form the Miniserver
                    ajax.error(function(xhr, statusText) {
                        // Its enough to just add the error function, we don't need to do anything.
                    });
                }

                if (rawResponse) {
                    return res;
                } else {
                    return res.then(this._checkResponse);
                }
            },

            /**
             * Just like request, but it returns only the results value parsed as JSON.
             * @param url
             * @param cmd
             * @param data
             * @result {Promise}    a promise that resolves with the results value, represented as parsed json.
             */
            requestValue: function requestValue(url, cmd, data) {
                return this.request(url, cmd, data).then(function (json) {
                    return this._retrieveValue(json);
                }.bind(this));
            },

            /**
             * Will launch an authentication request based on the username and password provided. The credentials will be hashed
             * using the otSalt provided. The request will NOT be encrypted.
             * @param url
             * @param username
             * @param password
             * @param otSalt            the onetime salt to use for authenticating
             * @param currentMsVersion
             * @returns {*}
             */
            authViaPassword: function authViaPassword(url, username, password, otSalt, currentMsVersion) {
                var hashAlg = FeatureCheck.check(FeatureCheck.feature.SHA_256, currentMsVersion) ? CryptoAdapter.HASH_ALGORITHM.SHA256 : CryptoAdapter.HASH_ALGORITHM.SHA1,
                    authData = {
                    auth: CryptoAdapter["Hmac" + hashAlg](username + ":" + password, "utf8", otSalt, "hex", "hex"),
                    user: username
                };
                return this.request(url, Commands.STRUCTURE_FILE_DATE, authData);
            },

            /**
             * Acquire the public key for this Miniserver
             * @param url
             */
            getPublicKey: function getPublicKey(url) {
                if (_public_key) {
                    return Promise.resolve(_public_key);
                } else {
                    return this.requestValue(url, Commands.ENCRYPTION.GET_PUBLIC_KEY).then(function(pubKey) {
                        _public_key = pubKey;
                        return pubKey;
                    });
                }
            },

            /**
             * Once this method has been called encryption can be used.
             * @param pubKey
             */
            setPublicKey: function setPublicKey(pubKey) {
                _public_key = pubKey;
            },

            /**
             * Will request a token using the username and password provided. The password will be transmitted both hashed and
             * encrypted.
             * @param url
             * @param username
             * @param password
             * @param type          the token type (e.g. 0 = short lived for WI, 1 = long lived for apps, ..)
             * @param deviceUuid    id that is used on the miniserver to uniquely identify this device. should remain the same over time
             * @param deviceInfo    userfriendly device info that will be used to display who currently has tokens.
             * @returns {*}
             */
            requestToken: function requestToken(url, username, password, type, deviceUuid, deviceInfo) {
                var pwHash,
                    hash,
                    cmd;

                return this._requestTokenSalts(url, username).then(function(saltObj) {
                    // create a SHA1 hash of the (salted) password
                    pwHash = CryptoAdapter[saltObj.hashAlg](password + ":" + saltObj.salt).toString();
                    pwHash = pwHash.toUpperCase();

                    // hash with user and otSalt
                    hash = this._otHash(username + ":" + pwHash, saltObj.oneTimeSalt, saltObj.hashAlg);

                    // build up the token command
                    cmd = this._getTokenCmd(hash, username, type, deviceUuid, deviceInfo);

                    // launch it
                    return this.lxEncRequestValue(url, cmd);
                }.bind(this));
            },

            // ----------------------------------------------------------------------------------------------------
            // -----                                     Private Methods                                    -------
            // ----------------------------------------------------------------------------------------------------

            /**
             * Will create a oneTime hash of the payload using the salt provided
             * @param payload
             * @param otSalt
             * @param hashAlg
             * @returns {string}
             * @private
             */
            _otHash: function _otHash(payload, otSalt, hashAlg) {
                hashAlg = hashAlg || CryptoAdapter.HASH_ALGORITHM.SHA1;
                return CryptoAdapter["Hmac" + hashAlg](payload, "utf8", otSalt, "hex", "hex");
            },

            /**
             * Will build up the get token command including all the infos required for it.
             * @param hash
             * @param user
             * @param permission
             * @param uuid
             * @param info
             * @returns {string}
             * @private
             */
            _getTokenCmd: function _getTokenCmd(hash, user, permission, uuid, info) {
                var encInfo = encodeURIComponent(info).replace(/\//g, " ");
                return Commands.format(Commands.TOKEN.GET_TOKEN, hash, user, permission, uuid, encInfo);
            },

            /**
             * Will request the salts required to acquire a token
             * @param url
             * @param username
             */
            _requestTokenSalts: function _requestTokenSalts(url, username) {
                var cmd = Commands.format(Commands.TOKEN.GET_USERSALT, username);
                return this.lxEncRequestValue(url, cmd).then(function(result) {
                    return {
                        oneTimeSalt: result.key,
                        salt: result.salt,
                        hashAlg: result.hashAlg || CryptoAdapter.HASH_ALGORITHM.SHA1
                    };
                });
            },

            /**
             * Will analyize the responses status, as an error might respond with HTTP-Status 200, but inside it reveals an error.
             * @param resp
             * @returns {*}
             */
            _checkResponse: function _checkResponse(resp) {
                var status = parseInt(resp.LL.Code || resp.LL.code);
                if (status >= 200 && status < 400) {
                    return resp;
                } else {
                    throw new Error(resp);
                }
            },

            /**
             * Will launch an encrypted request to the Miniserver provided via the url.
             * @param url
             * @param cmd
             * @returns {*}
             */
            lxEncRequestValue: function lxEncRequestValue(url, cmd) {
                var encObj, decrResponse;
                DEBUG && console.log("App -> Miniserver (enc): " + cmd);
                return this.getPublicKey(url).then(function (pKey) {
                    encObj = this.encryptRequest(cmd, pKey);
                    return this.request(url, encObj.encCmd, null, true); // don't check the response, it's encrypted.
                }.bind(this)).then(function decryptResponse(rsp) {
                    try {
                        decrResponse = this._aesDecryptedUtf8(rsp, encObj.aesKey, encObj.aesIV);
                        decrResponse = JSON.parse(decrResponse);
                    } catch (ex) {
                        // nothing to do.
                        decrResponse = rsp;
                    }
                    DEBUG && console.log("Miniserver -> App (enc): " + JSON.stringify(decrResponse));

                    // perform response check after decrypting it!
                    decrResponse = this._checkResponse(decrResponse);

                    // return the value itself.
                    return this._retrieveValue(decrResponse)
                }.bind(this));
            },

            /**
             * Takes the steps as documented in the Loxone API documentation on encrypted HTTP Requests
             * @param cmd
             * @param pubKey
             * @returns {*} an object containing the aesKey, aesIV, the salt and the encrypted cmd
             */
            encryptRequest: function encryptRequest(cmd, pubKey) {
                var payload,
                    rsaCipher,
                    aesCipher,
                    result = {};
                // assumes step 1 & 2 of the documentation have already been passed

                // 3. Generate a random salt, hex string (length may vary, e.g. 2 bytes) -> {salt}
                result.salt = this._hexSalt();

                // 4. Prepend the salt to the actual message “salt/{salt}/{cmd}” ->{plaintext}
                payload = "salt/" + result.salt + "/" + cmd;

                // 5. Generate a AES256 key -> {key} (Hex)
                result.aesKey = this._aesKey();

                // 6. Generate a random AES iv (16 byte) -> {iv} (Hex)
                result.aesIV = this._aesIV();

                // 7. Encrypt the {plaintext} with AES {key} + {iv} -> {cipher} (Base64)
                aesCipher = this._aesEncryptedBase64(payload, result.aesKey, result.aesIV);

                // 8.  Prepare the command-> {encrypted-command}, in the WI-Loader, it's always full encryption
                // don't encodeURIComponent() the aesCipher, the CloudDNS can't handle it
                payload = Commands.format(Commands.ENCRYPTION.COMMAND_AND_RESPONSE, aesCipher);

                // 9. RSA Encrypt the AES key+iv with the {publicKey} -> {session-key} (Base64)
                rsaCipher = this._rsaEncrypt(result.aesKey + ":" + result.aesIV, pubKey);

                // 10.  Append the session key to the {encrypted-command} -> {encrypted-command}
                // don't encodeURIComponent() the rsaCipher, the CloudDNS can't handle it
                result.encCmd = payload + "?sk=" + rsaCipher;

                return result; // steps 13, 14, 15 will be performed on the outside.
            },

            // Crypto

            _hexSalt: function _hexSalt() {
                return CryptoJS.lib.WordArray.random(2).toString(CryptoJS.enc.Hex);
            },

            _aesIV: function _aesIV() {
                return CryptoJS.lib.WordArray.random(128/8).toString(CryptoJS.enc.Hex);
            },
            _aesKey: function _aesKey() {
                var salt = CryptoJS.lib.WordArray.random(128/8),
                    hexId = CryptoJS.enc.Hex.parse(this._generateRandomHexId()),
                    key = hexId.toString();
                return CryptoJS.PBKDF2(key, salt, { keySize: 256/32, iterations: 50 }).toString(CryptoJS.enc.Hex);
            },

            /**
             * Returns a random hexdecimal id string.
             * @returns {string}
             * @private
             */
            _generateRandomHexId: function _generateRandomHexId() {
                return CryptoJS.lib.WordArray.random(36).toString(CryptoJS.enc.Hex);
            },

            /**
             * AES encrypts the plaintext with the key and iv
             * @param payload
             * @param key       hex string
             * @param iv        hex string
             * @returns {string} Base64
             */
            _aesEncryptedBase64: function _aesEncryptedBase64(payload, key, iv) {
                var encrypted = CryptoJS.AES.encrypt(
                    payload,
                    CryptoJS.enc.Hex.parse(key),
                    {
                        iv: CryptoJS.enc.Hex.parse(iv),
                        mode: CryptoJS.mode.CBC,
                        padding: CryptoJS.pad.ZeroPadding
                    }
                );
                return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
            },

            /**
             * AES decrypts the base64 ciphertext with the key and iv
             * @param ciphertext_base64
             * @param key_hex
             * @param iv_hex
             * @returns {string} utf8
             */
            _aesDecryptedUtf8: function _aesDecryptedUtf8(ciphertext_base64, key_hex, iv_hex) {
                ciphertext_base64 = ciphertext_base64.replace(/\n/, "");
                var ciphertext_hex = this._checkBlockSize(this._b64ToHex(ciphertext_base64), 16); // the blockSize is 16
                var cipherParams = CryptoJS.lib.CipherParams.create({
                    ciphertext: CryptoJS.enc.Hex.parse(ciphertext_hex)
                });
                var decrypted = CryptoJS.AES.decrypt(
                    cipherParams,
                    CryptoJS.enc.Hex.parse(key_hex),
                    {
                        iv: CryptoJS.enc.Hex.parse(iv_hex),
                        mode: CryptoJS.mode.CBC,
                        padding: CryptoJS.pad.ZeroPadding
                    }
                );
                return decrypted.toString(CryptoJS.enc.Utf8);
            },

            /**
             * checks blockSize and fills up with 0x00 if the hex string has an incorrect length
             * Bug in old Miniserver Versions!
             * https://www.wrike.com/open.htm?id=143296929
             * @param hexStr
             * @param blockSize
             * @returns hexStr
             */
            _checkBlockSize: function _checkBlockSize(hexStr, blockSize) {
                if (hexStr.length % blockSize > 0) {
                    hexStr = hexStr + new Array(blockSize - hexStr.length % blockSize + 1).join('0');
                }
                return hexStr;
            },

            /**
             * RSA encrypts the plaintext with the given public key
             * @param plaintext
             * @param publicKey
             * @returns {string} base64
             */
            _rsaEncrypt: function _rsaEncrypt(plaintext, publicKey) {
                var encrypt = new JSEncryptWrapper();
                encrypt.setPublicKey(publicKey);
                return encrypt.encrypt(plaintext);
            },

            _hexToString: function _hexToString(d) {
                var r = '', m = ('' + d).match(/../g), t;
                while (t = m.shift()) {
                    r += String.fromCharCode('0x' + t);
                }
                return r;
            },

            _b64ToHex: function _b64ToHex(b64) {
                return CryptoJS.enc.Base64.parse(b64).toString(CryptoJS.enc.Hex);
            },

            /**
             * Helper method that retrieves & parses the value from a JSON response from the Miniserver.
             * @param json
             * @private
             */
            _retrieveValue: function _retrieveValue(json) {
                try {
                    return JSON.parse(json.LL.value.replace(/\'/g, '"'));
                } catch (ex) {
                    return json.LL.value;
                }
            }
        }
    };

    //////////////////////////////////////////////////////////////////////
    module.exports = HttpRequest;
    //////////////////////////////////////////////////////////////////////

}).call(this);
