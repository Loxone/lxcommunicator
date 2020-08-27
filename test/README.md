# Mocha testing

The aim of this project is to automatically run mocha-tests with every push on github to check if the code was not damaged by the last change and if it is still working.

## About Mocha
Mocha is a Javascript test framework that is used to easily run asynchronous tests on Node.js or in the browser.

## Test example

In this example, two files are used for the tests. `doSomething.js` and `expectations.js`.
`doSomething.js` contains the code of what should be tested. The result is returned and is exported with `module.exports`. So `doSomething.js` has to be required in `expectations.js`.

Example:<br>
doSomething.js

```ruby
module.exports = function () { 
    if ( //condition ) {
        return true
    }
}
```

`true` is returned. The result is evaluated in `expectations.js`.

Example: <br>
expectations.js

```ruby
var lightTest = require(./doSomething.js);
var chai = require('chai');

describe('#result', function() {
  context('test if true', function () {  
    it('should be true', function() {
        chai.expect(result).to.be.true;
    });
  });
});
```

To use expect, you have to require the chai library in `expectations.js`. <br>
More information about [chai](https://www.chaijs.com/).

## This project
In this `test`-project a command is sent to the testminiserver in `lightTest.js` and `respons.LL`is returned. 
Then `respons.LL` is evaluated in `conditions.js`.

It is tested if:
* socket is opened
* code is right (200)
* socket send was successful (value = 1)

Mocha will return if each expectation is wheter fulfilled or failed.

These test-files are combined with an action file: `actionTest.yml`. 
In this file, npm is installed automatically and the tests are executed on every push to github.

## How to run test
To run the tests locally, type:
``` 
mocha
```
To end the process immediately after all tests, add `--exit`:
```
mocha --exit
```