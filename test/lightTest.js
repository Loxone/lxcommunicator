//Export code to test
module.exports = { 
  doTest: function doTest(socket) {

    /* scenes:
    778 = aus  
    1 = Viel Licht
    2 = Nacht
    3 = kochen
    4 = Test
    */
    var scene = 4

      // send command to miniserver
      // uuid: Beleuchtung Abstellraum
      return socket.send("jdev/sps/io/15064d77-002f-de7c-ffffc1a0bc6dbf48/changeTo/" + scene).then(function(respons) {    
        return respons.LL
        }, function (e) {
          throw console.error("Error: socket send failed"); // return error if socket send failed
      }); 
    
  }
}