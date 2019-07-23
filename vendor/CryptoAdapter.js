'use strict';

(function() {
    var EncryptionType = {
            NONE: 0,
            REQUEST: 1,                 // the request is encrypted
            REQUEST_RESPONSE_VAL: 2     // the request + the response value (only value!) is encrypted
        };

    // Require and check for any modules
    //////////////////////////////////////////////////////////////////////

    var CryptoJS = require('crypto-js');
    var Commands = require('./Commands');
    var JSEncryptWrapper = require('node-jsencrypt');
    var Debug = require('./Debug');

    //////////////////////////////////////////////////////////////////////

    var CryptoAdapter = {
        HASH_ALGORITHM: {
            SHA1: "SHA1",
            SHA256: "SHA256"
        }
    };

    /**
     * Creates a Hmac-SHA1 hash of the provided message
     * @param {string} message text which should be hashed
     * @param {'utf8'|'hex'} messageEncoding encoding of the message
     * @param key which is used to create the hash
     * @param {'utf8'|'hex'} keyEncoding encoding of the key
     * @param {'utf8'|'hex'} hashEncoding encoding of he result
     * @returns {string|*} resulting hash
     */
    CryptoAdapter.HmacSHA1 = function HmacSHA1(message, messageEncoding, key, keyEncoding, hashEncoding) {
        var msg = getEncoding(messageEncoding).parse(message);
        var k = getEncoding(keyEncoding).parse(key);
        var hash = CryptoJS.HmacSHA1(msg, k);

        return hash.toString(getEncoding(hashEncoding || 'utf8'));
    };


    CryptoAdapter.SHA1 = function SHA1(message) {
        return CryptoJS.SHA1(message).toString();
    };

    /**
     * Creates a Hmac-SHA1 hash of the provided message
     * @param {string} message text which should be hashed
     * @param {'utf8'|'hex'} messageEncoding encoding of the message
     * @param key which is used to create the hash
     * @param {'utf8'|'hex'} keyEncoding encoding of the key
     * @param {'utf8'|'hex'} hashEncoding encoding of he result
     * @returns {string|*} resulting hash
     */
    CryptoAdapter.HmacSHA256 = function HmacSHA256(message, messageEncoding, key, keyEncoding, hashEncoding) {
        var msg = getEncoding(messageEncoding).parse(message);
        var k = getEncoding(keyEncoding).parse(key);
        var hash = CryptoJS.HmacSHA256(msg, k);

        return hash.toString(getEncoding(hashEncoding || 'utf8'));
    };


    CryptoAdapter.SHA256 = function SHA256(message) {
        return CryptoJS.SHA256(message).toString();
    };


    CryptoAdapter.encrypt = function encryptAES(message, key) {
        var ct = CryptoJS.AES.encrypt(message, getKey(key));
        return ct.toString();
    };


    CryptoAdapter.decrypt = function decryptAES(ct, key) {
        var decrypted = CryptoJS.AES.decrypt(ct, getKey(key));

        return decrypted.toString(getEncoding('utf8'));
    };

    /**
     * Hashes the given payload using an MD5 algorithm.
     * @param payload   the payload to hash
     * @returns {*}     the hexadecimal hash
     */
    CryptoAdapter.md5Hex = function md5Hex(payload) {
        var hash = CryptoJS.MD5(payload);
        return hash.toString();
    };

    /**
     * Creates a random alphanumeric string with the given length
     * @param len           how long the seed should be.
     * @returns {string}    the random seed, exactly len characters long.
     */
    CryptoAdapter.createSeed = function createSeed(len) {
        var chars = "0123456789abcdefghijklmnopqrstuvwxyz";
        var result = '';
        for (var i = len; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
        return result;
    };


    var getKey = function getKey(id) {
        var key = getKey.cachedKey;
        if (!key) {
            // TODO-goelzda Do we realy need this?
            //var devId = VendorHub.DeviceInfo.getPlatformInfoObj().uuid; // this is a string
            /*var devId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
                return v.toString(16);
            }); // this is a string*/
            var hexId = getEncoding('hex').parse(id);

            key = hexId.toString();
            getKey.cachedKey = key;
        }

        return key;
    };


    /**
     * abstracts the available encoding types of the lib
     * @param encoding which should be normalized
     * @returns {*} correct encoding for the lib
     */
    var getEncoding = function(encoding) {
        encoding = (encoding).toLowerCase();
        if (encoding === "utf8" || encoding === "ascii") {
            return CryptoJS.enc.Utf8;
        } else if (encoding === "hex") {
            return CryptoJS.enc.Hex;
        } else {
            console.error("Invalid encoding: " + encoding + " not supported!");
            return {
                parse: function() { } // empty parse function so nothing will break
            };
        }
    };


    // RSA

    /**
     * RSA encrypts the plaintext with the given public key
     * @param plaintext
     * @param publicKey
     * @returns {string} base64
     */
    CryptoAdapter.rsaEncrypt = function rsaEncrypt(plaintext, publicKey) {
        var encrypt = new JSEncryptWrapper();
        encrypt.setPublicKey(publicKey);
        return encrypt.encrypt(plaintext);
    };


    // AES
    CryptoAdapter.generateAesKey = function generateAesKey(key) {
        var salt = CryptoJS.lib.WordArray.random(128/8);
        return CryptoJS.PBKDF2(getKey(key), salt, { keySize: 256/32, iterations: 50 }).toString(CryptoJS.enc.Hex);
    };

    CryptoAdapter.generateSalt = function generateSalt() {
        return CryptoJS.lib.WordArray.random(2).toString(CryptoJS.enc.Hex);
    };

    CryptoAdapter.generateAesIV = function generateAesIV() {
        return CryptoJS.lib.WordArray.random(128/8).toString(CryptoJS.enc.Hex);
    };

    /**
     * AES encrypts the plaintext with the key and iv
     * @param plaintext
     * @param key_hex
     * @param iv_hex
     * @returns {object} CryptoJS
     */
    CryptoAdapter.aesEncrypt = function aesEncrypt(plaintext, key_hex, iv_hex) {
        return CryptoJS.AES.encrypt(
            plaintext,
            CryptoJS.enc.Hex.parse(key_hex),
            {
                iv: CryptoJS.enc.Hex.parse(iv_hex),
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.ZeroPadding
            }
        );
    };

    /**
     * AES decrypts the base64 ciphertext with the key and iv
     * @param ciphertext_base64
     * @param key_hex
     * @param iv_hex
     * @returns {string} utf8
     */
    CryptoAdapter.aesDecrypt = function aesDecrypt(ciphertext_base64, key_hex, iv_hex) {
        ciphertext_base64 = ciphertext_base64.replace(/\n/, "");
        var ciphertext_hex = checkBlockSize(b64ToHex(ciphertext_base64), 16); // the blockSize is 16
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
    };

    /**
     * Will return a command that contains is aes encrypted and contains the payload provided. It also ensures the proper
     * encryption prefix is used (full or command only encryption).
     * @param payload
     * @param key
     * @param iv
     * @param encryptionType
     * @returns {*|string}
     */
    CryptoAdapter.getLxAesEncryptedCmd = function getLxAesEncryptedCmd(payload, key, iv, encryptionType) {
        Debug.Encryption && console.log("LxCrypto", "getLxAesEncryptedCmd: " + payload);
        var encrypted,
            ciphertext,
            ciphertextBase64,
            format,
            command;

        // AES encryption
        encrypted = CryptoAdapter.aesEncrypt(payload, key, iv);
        ciphertext = encrypted.ciphertext;

        ciphertextBase64 = ciphertext.toString(CryptoJS.enc.Base64);
        Debug.Encryption && console.log("LxCrypto", "   ciphertext base64: " + ciphertextBase64);
        Debug.Encryption && console.log("LxCrypto", "   ciphertext hex: " + ciphertext.toString(CryptoJS.enc.Hex));

        format = Commands.ENCRYPTION.COMMAND;
        if (encryptionType === EncryptionType.REQUEST_RESPONSE_VAL) {
            format = Commands.ENCRYPTION.COMMAND_AND_RESPONSE;
        }
        command = Commands.format(format, encodeURIComponent(ciphertextBase64));
        Debug.Encryption && console.log("LxCrypto", "   ecnryptedCmd: " + command);
        return command;
    };

    /**
     * checks blockSize and fills up with 0x00 if the hex string has an incorrect length
     * Bug in old Miniserver Versions!
     * https://www.wrike.com/open.htm?id=143296929
     * @param hexStr
     * @param blockSize
     * @returns hexStr
     */
    var checkBlockSize = function checkBlockSize(hexStr, blockSize) {
        if (hexStr.length % blockSize > 0) {
            hexStr = hexStr + new Array(blockSize - hexStr.length % blockSize + 1).join('0');
        }
        return hexStr;
    };

    var b64ToHex = function (b64) {
        return CryptoJS.enc.Base64.parse(b64).toString(CryptoJS.enc.Hex);
    };

    //////////////////////////////////////////////////////////////////////
    module.exports = CryptoAdapter;
    //////////////////////////////////////////////////////////////////////

}).call(this);
