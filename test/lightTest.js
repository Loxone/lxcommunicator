//Export code to test
module.exports = { 
  doTest: function doTest(socket) {
    var scene = 4
    
      return socket.send("jdev/sps/io/15064d77-002f-de7c-ffffc1a0bc6dbf48/changeTo/" + scene).then(function(respons) {
        return respons.LL
        }, function (e) {
          throw console.error("socket send failed");
      }); 
    
  }
}

/*
context('value:', function() {
      it('socket send succesfull (value  1)', async function() {
        await lightTest.doTest(socket).then(async function(res) { 
          await console.log("value: " + res.value);
          console.log(res.value)
          await chai.expect(res.value).to.equal('1');
        });
      });
    })
*/

/*context('code:', function() {
  lightTest.doTest(socket);
  it('right code (200)', async function() {
    await lightTest.doTest(socket).then(async function(res) {
      await console.log("code: " + res.Code);
      await chai.expect(res.Code).to.equal('200')
      
    });
  });
});

*/