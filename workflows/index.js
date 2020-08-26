// node github/workflows/Tests/index.js
//=== Node.js only ===

const { delay, timeout } = require('q');
const { SSL_OP_EPHEMERAL_RSA } = require('constants');
const { notEqual, doesNotMatch } = require('assert');
const { iterate } = require('when');


var LxCommunicator = require('lxcommunicator');
const { domainToUnicode } = require('url');
//=== Node.js only ===

// Prepare our variables
// uuid is used to identify a device
var uuid = getUUID(),
    // delegateObj is contains all available delegate methods
    delegateObj = {
        socketOnDataProgress: function socketOnDataProgress(socket, progress) {
           // console.log(progress);
        },
        socketOnTokenConfirmed: function socketOnTokenConfirmed(socket, respons) {
           // console.log(respons);
        },
        socketOnTokenReceived: function socketOnTokenReceived(socket, result) {
          //  console.log(result);
        },
        socketOnTokenRefresh: function socketOnTokenRefresh(socket, newTkObj) {
          //  console.log(newTkObj);
        },
        socketOnConnectionClosed: function socketOnConnectionClosed(socket, code) {
           // console.log(code);
        },
        socketOnEventReceived: function socketOnEventReceived(socket, events, type) {
           
        }
    },
    // deviceInfo is a device specific information like the userAgent of a Browser
    deviceInfo;
//fdjfadk;
// Node.js doesn't have a userAgent, lets use the hostname instead
if (typeof window !== "undefined") {
    deviceInfo = window.navigator.userAgent;
} else {
    deviceInfo = require('os').hostname();
}
//fj;
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
        circleScenes(); // entfernen, soll nicht teil der tests sein
    }, function (e) {
        
    });
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




// 778, 3, 1, 2
var scenesToIterate = [778, 3, 1, 2];
var itInterval = 1000;
var idx = 0;

function circleScenes() {
    var iterate = function iterate (scenesToIterate) {
        if (idx < scenesToIterate.length) { 
            var scene = scenesToIterate[idx];
            console.log(scene); 
            socket.send("jdev/sps/io/15064d77-002f-de7c-ffffc1a0bc6dbf48/changeTo/" + scene).then(function(respons) {
                idx++;
                              

                setTimeout(function () {
                    //iterate(scenesToIterate)
                }, itInterval); 
            })
        }
        else {
            idx = 0; 
            setTimeout(function () {
                iterate(scenesToIterate)
            }, 0);              
        }
    };
    ;
    iterate(scenesToIterate); 
    return respons.LL;
}
