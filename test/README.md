# Mocha testing

The aim of this project is to automatically run mocha-tests with every push on github to check if the code was not damaged by the last change and if it is still working.

## About Mocha
Mocha is a Javascript test framework that is used to easily run asynchronous tests on Node.js or in the browser.

## This Project
Two files are used for the tests. `lightTest.js` and `conditions.js`.
`lightTest.js` contains the code of what should be tested. The result is returned and is exported with `module.exports`.  
For Example:

```ruby
module.exports = function () { 
    if ( //condition ) {
        return true
    }
}
```
`true` is returned.
