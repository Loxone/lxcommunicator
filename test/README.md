# Mocha testing

The aim of this project is to automatically run mocha-tests with every push on github to check if the code was not damaged by the last change and if it is still working.

## About Mocha
Mocha is a Javascript test framework that is used to easily run asynchronous tests on Node.js or in the browser.

## This Project

Two files are used for the tests. `lightTest.js` and `conditions.js`.
`lightTest.js` contains the code of what should be tested. The result is returned and is exported with `module.exports`. So `lightTest.js` has to be required in `condition.js`.

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

Example: <br>
condition.js

```ruby
var lightTest = require(./lightTest.js);
var chai = require('chai');

describe('#result', function() {
  context('test if true', function () {  
    it('should be true', function() {
        chai.expect(result).to.be.true;
    });
  });
});
```

To use expect, you have to require the chai library in condition.js
More information about [chai](https://www.chaijs.com/).