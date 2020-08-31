# Mocha testing

The aim of this project is to automatically run mocha-tests with every push on github to check if the code was not damaged by the last change and if it is still working.

## About Mocha
Mocha is a Javascript test framework that is used to easily run asynchronous tests on Node.js or in the browser.
Bevore using mocha it has to be installed.
```
npm install mocha
```

## Test example

In this example, two files are used for the tests. `lightTest.js` and `conditions.js`.
`lightTest.js` contains the code of what should be tested. The result is returned and is exported with `module.exports`. So `lightTest.js` has to be required in `conditions.js`.

Example:<br>
lightTest.js

```ruby
module.exports = function () { 
    if ( //condition ) {
        return true
    }
}
```

`true` is returned. The result is evaluated in `conditions.js`.

Example:<br>
conditions.js

```ruby
var result = require(./lightTest.js);
var chai = require('chai');

describe('#result', function() {
  context('test if true', function () {  
    it('should be true', function() {
        chai.expect(result).to.be.true;
    });
  });
});
```
Mocha returns either fulfilled or failed for each expectation. <br>
To use expect, you have to require the chai library in `conditions.js`. <br>
More information about [chai](https://www.chaijs.com/).

## This project
In this `test`-project a command is sent to the testminiserver in `lightTest.js` and `respons.LL`is returned. 
Then `respons.LL` is evaluated in `conditions.js`.

It is tested if:
* socket is opened
* code is right (200)
* socket send was successful (value = 1)

Mocha returns either fulfilled or failed for each expectation.

These test-files are combined with an action file: `.github/workflows/actionTest.yml`. 
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