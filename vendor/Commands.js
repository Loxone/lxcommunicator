'use strict';

(function() {

    //////////////////////////////////////////////////////////////////////
    // Require and check for any modules

    var sprintf = require("sprintf-js").sprintf;
    if (!sprintf) {
        sprintf = window.sprintf;
    }

    //////////////////////////////////////////////////////////////////////

    var Commands = {
        GET_KEY: "jdev/sys/getkey",
        GET_API_KEY: "jdev/cfg/apiKey",
        AUTHENTICATE: "authenticate/%s",                    // hash user:pw
        STRUCTURE_FILE_DATE: "jdev/sps/LoxAPPversion3",

        ENCRYPTION: {
            GET_PUBLIC_KEY: "jdev/sys/getPublicKey",
            KEY_EXCHANGE: "jdev/sys/keyexchange/%s",            // RSA encrypted session key+iv in base64
            AUTHENTICATE: "authenticateEnc/%s",                 // AES encrypted hash in base64
            AES_PAYLOAD: "salt/%s/%s",                          // [salt, payload] --> this is the part that will be AES encrypted.
            AES_NEXT_SALT: "nextSalt/%s/%s/%s",                 // [currSalt, nextSalt, payload] --> this is the part that will be AES encrypted.

            COMMAND: "jdev/sys/enc/%s",                         // cipher
            COMMAND_AND_RESPONSE: "jdev/sys/fenc/%s"            // cipher, also the response will be encoded
        },

        TOKEN: {
            GET_USERSALT: "jdev/sys/getkey2/%s",                // [user] --> requests both a one-time-salt (key) and a user-salt
            GET_TOKEN: "jdev/sys/gettoken/%s/%s/%d/%s/%s",      // [hash, user, type, uuid, info] --> requests a token, type specifies the lifespan, uuid is used to identify who requested the token & info is a userfriendly info on the platform/device used.
            GET_TOKEN_ID: "jdev/sys/gettoken/",                 // to detect the command
            AUTHENTICATE: "authwithtoken/%s/%s",                // [hash, user]
            AUTHENTICATE_ID: "authwithtoken/",                  // [hash, user] --> to detect the command
            REFRESH: "jdev/sys/refreshtoken/%s/%s",             // [tokenHash, user]
            CHECK: "jdev/sys/checktoken/%s/%s",                 // [tokenHash, user]    // available since 10.0.9.13, successful if the token is valid.
            KILL: "jdev/sys/killtoken/%s/%s",                   // [tokenHash, user]
            AUTH_ARG: "autht=%s&user=%s",                       // [tokenHash, user]
            GET_JWT_TOKEN: "jdev/sys/getjwt/%s/%s/%d/%s/%s",    // [hash, user, type, uuid, info] --> requests a JSON web token, type specifies the lifespan, uuid is used to identify who requested the token & info is a userfriendly info on the platform/device used.
            REFRESH_JWT: "jdev/sys/refreshjwt/%s/%s"
        },

        /**
         * formats commands with C-Style format (use this method for commands instead of lxFormat  due to localization of lxFormat!
         * arguments cmd, args
         * @returns {string}
         */
        format: function formatCommand() {
            return sprintf.apply(null, arguments);
        }
    };

    //////////////////////////////////////////////////////////////////////
    module.exports = Commands;
    //////////////////////////////////////////////////////////////////////
}).call(this);
