//Export code to test
module.exports = { 
  doTest: function doTest(socket) {
    var scene = 1
    
      return socket.send("jdev/sps/io/15064d77-002f-de7c-ffffc1a0bc6dbf48/changeTo/" + scene).then(function(respons) {
          return respons.LL
      }, function (e) {
          throw console.error("socket open failed: check if hostname, username and password are correct");
      }); 
    
  }
}
