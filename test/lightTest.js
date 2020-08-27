const { SSL_OP_EPHEMERAL_RSA } = require('constants');
const { notEqual, doesNotMatch } = require('assert');
//const { iterate } = require('when');
const { domainToUnicode } = require('url');

var LxCommunicator = require('../LxCommunicator.js');

var uuid = getUUID(),
    delegateObj = {
        socketOnDataProgress: function socketOnDataProgress(socket, progress) {
        },
        socketOnTokenConfirmed: function socketOnTokenConfirmed(socket, respons) {
        },
        socketOnTokenReceived: function socketOnTokenReceived(socket, result) {
        },
        socketOnTokenRefresh: function socketOnTokenRefresh(socket, newTkObj) {
        },
        socketOnConnectionClosed: function socketOnConnectionClosed(socket, code) {
        },
        socketOnEventReceived: function socketOnEventReceived(socket, events, type) {
           
        }
    },
    deviceInfo;

if (typeof window !== "undefined") {
    deviceInfo = window.navigator.userAgent;
} else {
    deviceInfo = require('os').hostname();
}

var WebSocketConfig = LxCommunicator.WebSocketConfig;
var config = new WebSocketConfig(WebSocketConfig.protocol.WS, uuid, deviceInfo, WebSocketConfig.permission.APP, false);
config.delegate = delegateObj;

function getUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
  });
}
var socket = new LxCommunicator.WebSocket(config);


//export code to test
module.exports = { 
  doTest: function doTest() {
    var scene = 1
    return socket.open("testminiserver.loxone.com:7777", "app", "LoxLIVEpasswordTest").then(function() {
      return socket.send("jdev/sps/io/15064d77-002f-de7c-ffffc1a0bc6dbf48/changeTo/" + scene).then(function(respons) {
        socket.close(1000, "complete")
          return respons.LL
        }, function (e) {
          throw console.error("socket send failed");
      }); 
    });
  }
}
