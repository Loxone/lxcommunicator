#LxCommunicator v0.9
This module exposes all necessary modules to establish a secure and encrypted connection to a Loxone Miniserver.
<br>
LxCommunicator can be installed using **[npm](http://npmjs.com/)** or **[bower](https://bower.io/)**

##Disclaimer
- Loxone Electronics GmbH doesn't provide any support for this module
- Please submit an issue or file an pull request if you find any issue

##Support
| Native                              | Supported  |
|:------------------------------------|:-----------|
| Node.js                             | [x]        |
| [Browserify](http://browserify.org/)| [x]        |

| Browser         | Supported   |
|:----------------|:------------|
| Safari (Mobile) | [x]         |
| Chrome (Mobile) | [x]         |
| Firefox         | [x]         |
| Edge            | [x]         |
| IE              | [ ]         |

##Use LxCommunicator
####Node.js and Browserify
*Example:* `./test/index.js`

> **Note for Browserify**<br>Please make sure [Browserify is correctly configured](http://browserify.org/#install)!
- Add LxCommunicator as a local module
````
npm install lxcommunicator --save
````
- Require LxCommunicator
````
var LxCommunicator = require('lxcommunicator');
````

####Browser
*Example:* `./test/index.html`
- Add LxCommunicator as a local module
```
npm install lxcommunicator --save
```

- Reference ``LxCommunicator~Browser.js`` in your ``index.html``
```
<script src="{PATH_TO_LXCOMMUNICATOR}/LxCommunicator~Browser.min.js"></script>
```
- LxCommunicator is exposed as a global object

#Developer Notes

##Example
**Please take a look in the `./test` folder and run `npm test` to run `./test/index.js` in Node.js**

##Create Browser module
- Execute the `browserify.js` script, it will create the browser modules
````
node ./browserify.js
````

##Set Debug flags
Go to `./vendor/Debug.js` and adopt the flags to your needs.<br>
> **Note:**<br>Don't forget to execute the browserify script everytime you make a change in this module!
