//=== Node.js only ===
// Lets require and assign LxCommunicator if the global LxCommunicator object doesn't exist yet (Node.js)
if (typeof LxCommunicator === 'undefined') {
    global.LxCommunicator = require('../LxCommunicator');
}
//=== Node.js only ===

// Prepare our variables
// uuid is used to identify a device
var uuid = getUUID(),
    // delegateObj is contains all available delegate methods
    delegateObj = {
        socketOnDataProgress: function socketOnDataProgress(socket, progress) {
            console.log(progress);
        },
        socketOnTokenConfirmed: function socketOnTokenConfirmed(socket, response) {
            console.log(response);
        },
        socketOnTokenReceived: function socketOnTokenReceived(socket, result) {
            console.log(result);
        },
        socketOnConnectionClosed: function socketOnConnectionClosed(socket, code) {
            console.log(code);
        },
        socketOnEventReceived: function socketOnEventReceived(socket, events, type) {
            if (type === 2) {
                events.forEach(function(event) {
                    console.log(event.uuid + " -> " + event.value);
                });
            }
        }
    },
    // deviceInfo is a device specific information like the userAgent of a Browser
    deviceInfo;

// Node.js doesn't have a userAgent, lets use the hostname instead
if (typeof window !== "undefined") {
    deviceInfo = window.navigator.userAgent;
} else {
    deviceInfo = require('os').hostname();
}

// OPTIONAL
// If no version is set LxCommunicator.WebSocket will fetch the version on its own
// This version is needed to determine if the Miniserver supports encryption and tokens
//LxCommunicator.setConfigVersion("9.3.2.20");

// Get the LxCommunicator.WebSocketConfig constructor, to save some space
var WebSocketConfig = LxCommunicator.WebSocketConfig;

// Instantiate a config object to pass it to the LxCommunicator.WebSocket later
var config = new WebSocketConfig(WebSocketConfig.protocol.WS, uuid, deviceInfo, WebSocketConfig.permission.APP, false);

// OPTIONAL: assign the delegateObj to be able to react on delegate calls
config.delegate = delegateObj;

// Instantiate the LxCommunicator.WebSocket, it is our actual WebSocket
var socket = new LxCommunicator.WebSocket(config);

// Open a Websocket connection to a miniserver by just providing the host, username and password!
socket.open("testminiserver.loxone.com:7777", "app", "LoxLIVEpasswordTest").then(function() {
    // Send a command, handle the response as you wish
    socket.send("jdev/sps/enablebinstatusupdate").then(function(respons) {
        console.log("Successfully executed '" + respons.LL.control + "' with code " + respons.LL.Code + " and value " + respons.LL.value);
    }, function(err) {
        console.error(err);
    });

}, function(e) {
    console.error(e);
});


//=======================================================================================
// Helper functions
function getUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}
//=======================================================================================
