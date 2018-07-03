(function() {
    var globalObj;

    // There are different global variables in the browser (window) and node.js (global)
    if (typeof window !== 'undefined') {
        globalObj = window;
    } else {
        globalObj = global;
    }

    var Utils = {},
        values = require('object.values'); // Shim used for Object.values()

    /** Function count the occurrences of substring in a string;
     * @param {String} string   Required. The string;
     * @param {String} subString    Required. The string to search for;
     * @param {Boolean} [allowOverlapping]     Optional. Default: false;
     */
    globalObj.occurrences = function occurrences(string, subString, allowOverlapping) {
        string += "";
        subString += "";
        if (subString.length <= 0) return 0;

        var n = 0, pos = 0;
        var step = (allowOverlapping) ? (1) : (subString.length);

        while (true) {
            pos = string.indexOf(subString, pos);
            if (pos >= 0) {
                n++;
                pos += step;
            } else break;
        }
        return (n);

    };

    /**
     * Creates a deep copy of an object
     * @param from
     * @param to
     * @returns {*}
     */
    globalObj.cloneObjectDeep = function cloneObjectDeep(from, to) {
        if (from == null || typeof from !== "object") return from;
        if (from._isAMomentObject) return moment(from);
        if (from.constructor !== Object && from.constructor !== Array) return from;
        if (from.constructor === Date || from.constructor === RegExp || from.constructor === Function ||
            from.constructor === String || from.constructor === Number || from.constructor === Boolean) {
            return new from.constructor(from);
        }

        to = to || new from.constructor();

        for (var name in from) {
            to[name] = typeof to[name] === "undefined" ? cloneObjectDeep(from[name], null) : to[name];
        }

        return to;
    };

    /**
     * Creates a shallow copy of an object (faster)
     * Be careful, do not use this with moment objects
     * @param from
     */
    globalObj.cloneObject = function cloneObject(from) {
        var result = null;
        if (from) {
            result = JSON.parse(stringify(from));
        }
        return result;
    };

    /**
     * converts arraybuffer to utf-8 string
     * @param buffer
     * @returns {string}
     */
    globalObj.arrayBufferToString = function arrayBufferToString(buffer) {
        var result = "",
            i = 0,
            c = 0,
            c3 = 0,
            c2 = 0,
            data = new Uint8Array(buffer);
        // If we have a BOM skip it
        if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
            i = 3;
        }
        while (i < data.length) {
            c = data[i];
            if (c < 128) {
                result += String.fromCharCode(c);
                i++;
            } else if (c > 191 && c < 224) {
                if( i+1 >= data.length ) {
                    throw "UTF-8 Decode failed. Two byte character was truncated.";
                }
                c2 = data[i+1];
                result += String.fromCharCode( ((c&31)<<6) | (c2&63) );
                i += 2;
            } else {
                if (i+2 >= data.length) {
                    throw "UTF-8 Decode failed. Multi byte character was truncated.";
                }
                c2 = data[i+1];
                c3 = data[i+2];
                result += String.fromCharCode( ((c&15)<<12) | ((c2&63)<<6) | (c3&63) );
                i += 3;
            }
        }

        return result;
    };



    /**
     * Will return an integer response code if provided with an LX request.
     * @param response
     */
    globalObj.getLxResponseCode = function getLxResponseCode(response) {
        var code = 0;
        if (response && response.LL) {
            code = parseInt(response.LL.Code || response.LL.code);
        }
        return code;
    };

    /**
     * Will return the parsed response value provided with an LX request.
     * @param res
     * @param [asString]    if the value is to be parsed (false or missing) or left as string (true).
     */
    globalObj.getLxResponseValue = function getLxResponseValue(res, asString) {
        var value = res;
        try {
            if (typeof res.LL.value === "string" && !asString) {
                res.LL.value = res.LL.value.replace(/\\"/g, '"'); // fix for Miniserver bug
                value = JSON.parse(res.LL.value);
            } else {
                value = res.LL.value;
            }

        } catch (ex) {
            console.error("Could not acquire the response value from " + JSON.stringify(res));
            throw ex;
        }
        return value;
    };

    /**
     * Bitwise check. Returns true if the bits provided are set
     *  * Example with a bitmask of 9 (1001)
     * 9.isBitSet(1) === true
     * 9.isBitSet(8) === true
     * 9.isBitSet(2) === false
     * @param value       the value to check if the bits are set
     * @param bit           the bit to check
     * @returns {boolean}   whether or not the bit is set in toCheck
     */
    globalObj.hasBit = function hasBit(value, bit) {
        return (value & bit) === bit;
    };

    /**
     * Helper method that will return a promise that resolves with succVal if valid is true and rejects with errVal if the
     * value is false.
     * @param valid
     * @param succVal
     * @param errVal
     * @returns {*}
     */
    globalObj.prmsfy = function prmsfy(valid, succVal, errVal) {
        var def = Q.defer();
        valid ? def.resolve(succVal) : def.reject(errVal);
        return def.promise;
    };

    /**
     * If String.prototype.startsWith does not exist String.prototype.hasPrefix will be used
     * String.prototype.startsWith is not available from Android 4.4.2 to 5.1
     */
    if (String.prototype.startsWith === undefined) {
        String.prototype.startsWith = String.prototype.hasPrefix;
    }

    /**
     * Rounds the given value to n decimal points.
     * @param value             the value to round
     * @param [nDecimals]       if 2 e.g. 3.5623 becomes 3.56, if 1 it becomes 3.6. Default: 0, so it'd become 4
     * @returns {number}
     */
    globalObj.roundN = function(value, nDecimals) {
        if (!nDecimals || nDecimals === 0) {
            return Math.round(value);
        } else {
            var a = Math.pow(10, nDecimals);
            return parseFloat((Math.round(value * a) / a));
        }
    };

    // Object.values has just gained support by the latest Node.js version, use a shim, if Object.values doesn't exist.
    if (!Object.values) {
        values.shim();
    }

    //////////////////////////////////////////////////////////////////////
    module.exports = Utils;
    //////////////////////////////////////////////////////////////////////
}).call(this);
