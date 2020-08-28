//Export code to test
module.exports = { 
  doTest: function doTest(socket) {
    var scene = 1
    return socket.open("testminiserver.loxone.com:7777", "app", "LoxLIVEpasswordTest").then(function() {
      return socket.send("jdev/sps/io/15064d77-002f-de7c-ffffc1a0bc6dbf48/changeTo/" + scene).then(function(respons) {
          return respons.LL
      }, function (e) {
          throw console.error("socket send failed");
      }); 
    });
  }
}
