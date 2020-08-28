  var lightTest = require('./lightTest.js');
  var chai = require('chai');
  var res = require('./lightTest.js').doTest
  var LxCommunicator = require('../LxCommunicator.js');

  const { SSL_OP_EPHEMERAL_RSA } = require('constants');
  const { notEqual, doesNotMatch } = require('assert');
  const { iterate } = require('when');
  const { domainToUnicode } = require('url');
  const { assert } = require('console');
 
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
  
  var socket = new LxCommunicator.WebSocket(config);

  function getUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}



// Tests
  describe('#test', function () { 
    context('socket connection', function () {
      it('socket opened', async function () {
        await lightTest.doTest(socket).then(async function socketOpen(socket) {
          if (socket.readyState != socket.OPEN) {
            return false;
          }
          if (socket.readyState === socket.OPEN) {
            return true;
          }
          
        await chai.assert.isTrue(socketOpen(socket), "socket is opened");
        await chai.assert.isFalse(socketOpen(socket), "socken open failed");
        });
    })

    context('code:', function(done) {
      it('right code (200)', async function() {
        await lightTest.doTest(socket).then(async function(res) {
          await console.log("code: " + res.Code);
          await chai.expect(res.Code).to.equal('200');
        });
      });
      it('throw error if code is not 200', async function () {
        await lightTest.doTest(socket).then(async function(res) {
          await chai.assert.isTrue(res.Code == 200,"Error");
          await(done);
        }).catch(done);
      });
    });
    context('value:', function() {
      it('socket send succesfull', async function() {
        await lightTest.doTest(socket).then(async function(res) { 
          await console.log("value: " + res.value);
          await chai.expect(res.value).to.equal('1');
        });
      });
    })
  }); 
});

