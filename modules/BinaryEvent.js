'use strict';

(function() {
    // Require and check for any modules
    //////////////////////////////////////////////////////////////////////
    
    var moment = require('moment'),
        BitView = require('../vendor/BitView'),
        DataStream = require('../vendor/DataStream'),
        Debug = require('../vendor/Debug');

    //////////////////////////////////////////////////////////////////////

    function BinaryEvent(bytes, type) {
        var data = new DataStream(bytes, 0, DataStream.LITTLE_ENDIAN);
        this.type = type;

        switch (this.type) {
            case BinaryEvent.Type.FILE:
                //console.info("received file event");
                this.data = data;
                break;
            case BinaryEvent.Type.EVENT:
                this.events = this.readEvents(data);
                break;
            case BinaryEvent.Type.EVENTTEXT:
                this.events = this.readTextEvents(data);
                break;
            case BinaryEvent.Type.DAYTIMER:
                this.events = this.readDaytimerEvents(data);
                break;
            case BinaryEvent.Type.OUTOFSERVICE:
                console.error("miniserver out of service!");
                break;
            case BinaryEvent.Type.WEATHER:
                this.events = this.readWeatherEvents(data);
                break;
            default:
                console.info("invalid event type");
                break;
        }
    }

    BinaryEvent.Type = {
        TEXT: 0,
        FILE: 1,
        EVENT: 2,
        EVENTTEXT: 3,
        DAYTIMER: 4,
        OUTOFSERVICE: 5,
        KEEPALIVE: 6,
        WEATHER: 7
    };

    BinaryEvent.getTypeString = function getBinaryEventTypeString(typeNr) {
        for (var id in BinaryEvent.Type) {
            if (BinaryEvent.Type.hasOwnProperty(id) && BinaryEvent.Type[id] === typeNr) {
                return id;
            }
        }
        return typeNr;
    };

    BinaryEvent.prototype.readEvents = function readEvents(data) {
        Debug.Socket.BinaryEvents.ValueEvents && console.log("readEvents", data.byteLength, "Bytes");
        var events = [];

        while(!data.isEof()) {
            // 1 event = 24 Bytes
            events.push({
                uuid: this.getUUID(data), // 16 Bytes
                value: data.readFloat64(), // 8 Bytes
                toString: BinaryEvent.evToString
            });
            Debug.Socket.BinaryEvents.ValueEvents && console.log("    uuid:", events[events.length - 1].uuid, "value:", events[events.length - 1].value);
        }

        Debug.Socket.BinaryEvents.ValueEvents && console.log("    got",events.length,"ValueEvents");
        return events;
    };

    BinaryEvent.prototype.readTextEvents = function readTextEvents(data) {
        Debug.Socket.BinaryEvents.TextEvents && console.log("readTextEvents", data.byteLength, "Bytes");
        var uuid, uuidIcon, textLength, text, paddingBytes,
            events = [];

        while(!data.isEof()) {
            uuid = this.getUUID(data); // 16 Bytes
            uuidIcon = this.getUUID(data); // 16 Bytes
            textLength = data.readUint32(); // 4 Bytes

            Debug.Socket.BinaryEvents.TextEvents && console.log("    uuid:", uuid, "uuidIcon:", uuidIcon, "textLength:", textLength);

            paddingBytes = (textLength % 4); // textblock is multiple of 4 bytes ... if it's not a multiple of 4, then the rest is padding

            text = data.readString(textLength, "UTF-8"); // x Bytes

            Debug.Socket.BinaryEvents.TextEvents && console.log("    text:" + text);

            if (paddingBytes) {
                data.seek(data.position + (4 - paddingBytes)); // just skip remaining padding bytes (4 - bytes) = amount of bytes to skip
            }

            events.push({
                uuid: uuid,
                uuidIcon: uuidIcon,
                text: text,
                toString: BinaryEvent.textEvToString
            });
        }

        Debug.Socket.BinaryEvents.TextEvents && console.log("    got",events.length,"TextEvents");
        return events;
    };

    BinaryEvent.prototype.readDaytimerEvents = function readDaytimerEvents(data) {
        Debug.Socket.BinaryEvents.DaytimerEvents && console.log("readDaytimerEvents", data.byteLength, "Bytes");
        var events = [], entries = [],
            i, entry;

        var uuid, defVal, count;

        while(!data.isEof()) {
            uuid = this.getUUID(data); // 16 Bytes
            defVal = data.readFloat64(); // 8 Bytes
            count = data.readInt32(); // 4 Bytes

            Debug.Socket.BinaryEvents.DaytimerEvents && console.log("    uuid:", uuid, "defVal:", defVal, "count:", count);

            entries = [];

            for (i = 0; i < count; i++) {
                // 1 entry = 24 Bytes
                entry = data.readStruct([
                    'mode', 'int32', // 4 Bytes
                    'from', 'int32', // 4 Bytes
                    'to', 'int32', // 4 Bytes
                    'needActivate', 'int32', // 4 Bytes
                    'value', 'float64' // 8 Bytes
                ]);
                Debug.Socket.BinaryEvents.DaytimerEvents && console.log("    entry:" + JSON.stringify(entry));
                entry.nr = i;
                entries.push(entry);
            }

            events.push({
                uuid: uuid,
                defValue: defVal,
                entries: entries,
                toString: BinaryEvent.daytimerEvToString
            });
        }

        Debug.Socket.BinaryEvents.DaytimerEvents && console.log("    got",events.length,"DaytimerEvents");
        return events;
    };

    BinaryEvent.prototype.readWeatherEvents = function readWeatherEvents(data) {
        Debug.Socket.BinaryEvents.WeatherEvents && console.log("readWeatherEvents", data.byteLength, "Bytes");
        var events = [], entries = [],
            i, entry;

        var uuid, lastUpdate, count;

        while(!data.isEof()) {
            uuid = this.getUUID(data); // 16 Bytes
            lastUpdate = data.readUint32(); // 4 Bytes
            count = data.readInt32(); // 4 Bytes

            Debug.Socket.BinaryEvents.WeatherEvents && console.log("    uuid:", uuid, "lastUpdate:", lastUpdate, "count:", count);

            entries = [];

            for (i = 0; i < count; i++) {
                // 1 entry = 68 Bytes
                entry = data.readStruct([
                    'timestamp', 'int32', // 4 Bytes
                    'weatherType', 'int32', // 4 Bytes
                    'windDirection', 'int32', // 4 Bytes
                    'solarRadiation', 'int32', // 4 Bytes
                    'relativeHumidity', 'int32', // 4 Bytes
                    'temperature', 'float64', // 8 Bytes
                    'perceivedTemperature', 'float64', // 8 Bytes
                    'dewPoint', 'float64', // 8 Bytes
                    'precipitation', 'float64', // 8 Bytes
                    'windSpeed', 'float64', // 8 Bytes
                    'barometricPressure', 'float64' // 8 Bytes
                ]);

                Debug.Socket.BinaryEvents.WeatherEvents && console.log("    entry:" + JSON.stringify(entry));

                entries.push(entry);
            }

            events.push({
                uuid: uuid,
                lastUpdate: lastUpdate,
                entries: entries,
                toString: BinaryEvent.weatherEvToString
            });
        }

        Debug.Socket.BinaryEvents.WeatherEvents && console.log("    got",events.length,"WeatherEvents");
        return events;
    };

    BinaryEvent.prototype.getUUID = function getUUID (data) {
        var struct, uuidFrags = [], d4Frags = [];

        // uuid = 16 Bytes
        struct = data.readStruct([
            'd1', 'uint32', // 4 Bytes
            'd2', 'uint16', // 2 Bytes
            'd3', 'uint16', // 2 Bytes
            'd4', ['[]', 'uint8', 8] // 8 Bytes (8 * 1 Byte)
        ]);

        // convert uuid fragments to hex
        uuidFrags.push(this.toHex(struct.d1, 8));
        uuidFrags.push(this.toHex(struct.d2, 4));
        uuidFrags.push(this.toHex(struct.d3, 4));
        for (var j = 0; j < struct.d4.length; j++) {
            d4Frags.push(this.toHex(struct.d4[j], 2));
        }
        uuidFrags.push(d4Frags.join(''));

        return uuidFrags.join('-');
    };

    BinaryEvent.prototype.toHex = function toHex(value, length) {
        var zeroPadding = "";
        for (var i = 0; i < length; i++) {
            zeroPadding += "0";
        }

        return (zeroPadding + value.toString(16)).substr(-length);
    };

    BinaryEvent.evToString = function evToString() {
        return this.uuid +  " -> " + this.value;
    };

    BinaryEvent.textEvToString = function textEvToString() {
        return this.uuid +  " -> " +
            "icon=\"" + this.uuidIcon + "\" " +
            "text=\"" + this.text + "\"";
    };

    BinaryEvent.daytimerEvToString = function daytimerEvToString() {
        return this.uuid + " -> " +
            "defaultValue=\"" + this.defValue + "\" " +
            "entries=" + JSON.stringify(this.entries);
    };

    BinaryEvent.weatherEvToString = function weatherEvToString() {
        var date = moment([2009, 0, 1]);
        date.add('s', this.lastUpdate);
        return this.uuid + " -> " +
            "lastUpdate=\"" + date.format('LLLL') + "\" " +
            "entries=" + JSON.stringify(this.entries);
    };


    /**
     * Identifies the binary event type and the size of the following payload
     * @param bytes
     */
    BinaryEvent.identifyHeader = function identifyHeader(bytes) {
        if (bytes.byteLength === 8) {
            var data = new DataView(bytes);

            var header = {
                eventType: data.getUint8(1, true),
                length: data.getUint32(4, true)
            };

            // reserved checker
            //var reserved0 = data.getUint8(2, true);
            //var reserved1 = data.getUint8(3, true);
            //if (reserved0 || reserved1) {
            //  console.warn("WARNING: reserved bytes used (LX-BIN-Header) - tell walt ;-)");
            //}


            if (Debug.Socket.LowLevel) {
                var reservedByte1BV = new BitView(bytes);
                var bitString = "";
                for (var i = 0; i < bytes.byteLength * 8; i++) {
                    if (i > 0 && i % 8 === 0) {
                        bitString += "|";
                    }
                    bitString += reservedByte1BV.getBit(i);
                }
                console.log("Miniserver -> App: " + bitString);
            }

            var reservedByte1 = new BitView(new Uint8Array(bytes, 2, 1));
            header.estimated = reservedByte1.getBit(0) === 1;

            //var reservedByte2 = new BitView(new Uint8Array(bytes, 3, 1));

            //console.log("expected type: " + header.eventType);
            //console.log(" - expected length: " + header.length + " byte");


            /*var bin = data.getUint8(0, true);
             var type = data.getUint8(1, true);
             var reserved0 = data.getUint8(2, true);
             var reserved1 = data.getUint8(3, true);
             var length = data.getUint32(4, true);

             console.log("header: " + bin + "|" + type + "|" + reserved0 + "|" + reserved1 + "|" + length);*/

            return header;
        } else {
            console.error("ERROR: wrong binary header received!");
        }
    };

    //////////////////////////////////////////////////////////////////////
    module.exports = BinaryEvent;
    //////////////////////////////////////////////////////////////////////
}).call(this);
