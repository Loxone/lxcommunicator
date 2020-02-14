(function() {

    /**
     * Defines a Config used for LxSocketExtRFC6455
     * @param protocol
     * @param uniqueId
     * @param deviceInfo A string that identifies this device
     * @param requiredPermission
     * @param isDownloadSocket
     * @constructor
     */
    function WebSocketConfig(protocol, uniqueId, deviceInfo, requiredPermission, isDownloadSocket) {
        this._delegate = {};
        if (Object.values(WebSocketConfig.protocol).indexOf(protocol) === -1) {
            console.warn(this.name, "Unknown protocol '" + protocol + "' using '" + WebSocketConfig.protocol.WS + "' instead!");
            protocol = WebSocketConfig.protocol.WS;
        }
        this._protocol = protocol;
        this._uniqueId = uniqueId;
        this._deviceInfo = deviceInfo;
        this._requiredPermission = requiredPermission;
        this._isDownloadSocket = isDownloadSocket;
    }

    /**
     * Possible Websocket protocols
     * @type {{WS: string, WSS: string}}
     */
    WebSocketConfig.protocol = {
        WS: "ws://",
        WSS: "wss://"
    };

    /**
     * Possible permissions for the Miniserver
     * @type {{UNDEFINED: number, ADMIN: number, WEB: number, APP: number, CONFIG: number, FTP: number, USER_EDIT: number, EXPERT_MODE: number, OP_MODES: number, SYS_WS: number, AUTOPILOT: number, EXPERT_MODE_LIGHT: number}}
     */
    WebSocketConfig.permission = {
        UNDEFINED: 0,           // only for logging purposes.
        ADMIN: 1,               // User is in “Administrator” group (no token, just a permissive info)
        WEB: 2,                 // short-lived token, used for the WI
        APP: 4,                 // long lived token, used for the app
        CONFIG: 8,              // Login with Loxone Config
        FTP: 16,                // Login with FTP (only an access right, no token login for FTP)
        USER_EDIT: 32,          // edit user details (password change, very short lived - if an admin has this token, he may also edit other users credentials)
        EXPERT_MODE: 64,        // use expert mode.
        OP_MODES: 128,          // Edit operating modes
        SYS_WS: 256,            // Call System Webservices (e.g. reboot)
        AUTOPILOT: 512,         // Edit / create autopilots
        EXPERT_MODE_LIGHT: 1024 // expert mode light (nice and clear UI, only UI relevant settings, no configuration possible)
    };

    /**
     * Getters for the accessible properties
     * @type {{protocol, uniqueId, requiredPermission, isDownloadSocket}}
     */
    WebSocketConfig.prototype = {
        /**
         * Possible delegate methods
         * socketOnTokenConfirmed(socket, response)
         * socketOnTokenReceived(socket, result)
         * socketOnTokenInvalid(socket)
         * socketOnConnectionClosed(socket. code)
         * socketOnEventReceived(socket, events, type)
         * socketOnDataProgress(socket, progress) -> Only if socket is a downloadSocket
         * @return {*}
         */
        get delegate() {
            return this._delegate;
        },
        set delegate(delegate) {

            // null or undefined are invalid values
            // "config.delegate.delegateFunction &&" will fail due to "Cannot read property "delegateFunction" of null/undefined
            // This is not the case if delegate always is an object
            if (delegate === null || delegate === undefined) {
                delegate = {};
            }

            this._delegate = delegate;
        },
        get protocol() {
            return this._protocol;
        },
        get uniqueId() {
            return this._uniqueId;
        },
        get deviceInfo() {
            return encodeURIComponent(this._deviceInfo);
        },
        get requiredPermission() {
            return this._requiredPermission;
        },
        get isDownloadSocket() {
            return this._isDownloadSocket;
        }
    };

    //////////////////////////////////////////////////////////////////////
    module.exports = WebSocketConfig;
    //////////////////////////////////////////////////////////////////////
}).call(this);
