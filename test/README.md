# Mocha testing

The aim of this project is to automatically run mocha-tests with every push on github to check if the code was not damaged by the last change and if it is still working.

## About Mocha
Mocha is a Javascript test framework that is used to easily run asynchronous tests on Node.js or in the browser.

## This Project
Two files are used for the tests. `lightTest.js` and `conditions.js`.
`lightTest.js` contains the code of what should be tested. The result is returned and is exported with `module.exports`.
In this case:

```ruby
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
```