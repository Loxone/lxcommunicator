  var lightTest = require('./lightTest.js');
  var chai = require('chai');
  var res = require('./lightTest.js').doTest
  var LxCommunicator = require('../LxCommunicator.js');

  const { SSL_OP_EPHEMERAL_RSA } = require('constants');
  const { notEqual, doesNotMatch } = require('assert');
  const { iterate } = require('when');
  const { domainToUnicode } = require('url');
  const { assert } = require('console');
const { expect, AssertionError } = require('chai');
const { exit } = require('process');
 
  // prepare variables

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
    context('socket:', function() {
      it('socket is opened', async function() {
        await socket.open("testminiserver.loxone.com:7777", "app", "LoxLIVEpasswordTest"), function (e, done) {
          throw console.error("socket open failed: check if hostname, username and password are correct");
        }
      })
    })
    context('code:', function() {
      it('right code (200)', async function() {
        await lightTest.doTest(socket).then(async function(res) {
          await console.log("code: " + res.Code);
          await chai.expect(res.Code).to.equal('200')
        });
      });
    });
    context('value:', function() {
      it('socket send succesfull (value  1)', async function() {
        await lightTest.doTest(socket).then(async function(res) { 
          await console.log("value: " + res.value);
          console.log(res.value)
          await chai.expect(res.value).to.equal('1');
        });
      });
    })
  })



//mocha --timeout 10000 --exit