"use strict";

(function() {
    var root = this,
        previousLxCommunicator = root.LxCommunicator;

    // Require and check for any modules
    //////////////////////////////////////////////////////////////////////

    root.WebSocket = require('./modules/WebSocket');
    root.TokenHandler = require('./modules/TokenHandler');
    root.HttpRequest = require('./modules/HttpRequest');
    root.WebSocketConfig = require('./modules/WebSocketConfig');
    root.BinaryEvent = require('./modules/BinaryEvent');
    root.FeatureCheck = require('./vendor/FeatureCheck');
    root.SupportCode = require('./vendor/SupportCode');

    //////////////////////////////////////////////////////////////////////

    /**
     * Exposes all public classes and methods of LxCommunicator
     * @constructor
     */
    var LxCommunicator = function LxCommunicator() { };

    /**
     * Allows you to set the version of the Miniserver.
     * The WebSocket will fetch the current version on its own if no version is provided
     */
    LxCommunicator.setConfigVersion = root.FeatureCheck.setCurrentVersion;

    /**
     * Configuration class for the WebSocket
     * It also holds the delegate for the WebSocket with the following methods
     * socketOnTokenConfirmed(socket, response)
     * socketOnTokenReceived(socket, result)
     * socketOnTokenRefresh(socket, result) will be refreshed in Miniserver Version 10.1
     * socketOnConnectionClosed(socket. code)
     * socketOnEventReceived(socket, events, type)
     * socketOnDataProgress(socket, progress) -> Only if the socket is a downloadSocket
     */
    LxCommunicator.WebSocketConfig = root.WebSocketConfig;

    /**
     * Main communication channel with the Miniserver
     * It handles authentication, encryption, uses the correct protocol (can be defined in the WebSocketConfig)
     */
    LxCommunicator.WebSocket = root.WebSocket;
    
    LxCommunicator.TokenHandler = root.TokenHandler;

    /**
     * HTTP Communication channel with the Miniserver
     */
    LxCommunicator.HttpRequest = root.HttpRequest;

    /**
     * Helper class to interpret the Loxone binary events
     */
    LxCommunicator.BinaryEvent = root.BinaryEvent;

    LxCommunicator.SupportCode = root.SupportCode;

    /**
     * Allows the user to restore the "this" reference if we would overwrite a global variable
     */
    LxCommunicator.noConflict = function noConflict() {
        root.LxCommunicator = previousLxCommunicator;
    };

    //////////////////////////////////////////////////////////////////////
    module.exports = LxCommunicator;
    //////////////////////////////////////////////////////////////////////
}).call(this);
