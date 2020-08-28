# LxCommunicator v1.0.1
This module exposes all necessary modules to establish a secure and encrypted connection to a Loxone Miniserver.
<br>
LxCommunicator can be installed using **[npm](http://npmjs.com/)** (``npm i lxcommunicator``) or **[bower](https://bower.io/)** (``bower install lxcommunicator``)

## Disclaimer
- Loxone Electronics GmbH doesn't provide any support for this module
- Please submit an issue or file an pull request if you find any issue

## Support
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

## Use LxCommunicator
#### Node.js and Browserify
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

#### Browser
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

# Developer Notes

## Example
**Please take a look in the `./test` folder and run `npm test` to run `./test/index.js` in Node.js**

## Establish a TLS connection (`https://` and `wss://`)
- A TLS connection is *only* supported by the Miniserver Generation 2
- It is mandatory to enter the URL in the following format to ensure the Certificate matches the domain.
    - This prevents the `ERR_CERT_COMMON_NAME_INVALID` error.
- Both a local and remote connection can be established via the URL below (IPv4 and IPv6)
 
 | IP of the Miniserver                   | Serial Number of the Miniserver | Resulting URL                                            |
 |:---------------------------------------|:--------------------------------|:---------------------------------------------------------|
 | 89.23.45.12                            | 504f94a00001                    | https://89-23-45-12.504f94a00001.dyndns.loxonecloud.com  |
 | 192.168.0.77                           | 504f94a00001                    | https://192-168-0-77.504f94a00001.dyndns.loxonecloud.com |
 | [2001:db8:85a3:8d3:1319:8a2e:370:7348] | 504f94a00001                    | https://2001-db8-85a3-8d3-1319-8a2e-370-7348.504f94a00001.dyndns.loxonecloud.com |
 
 **Further information on on how to establish a TLS connection to a Miniserver Generation 2 can be found [here](https://www.loxone.com/enen/kb/api/)**
 
 **Common issues when using TLS (`https://` and `wss://`)**
 - Expired Certificate
   - Verify your expiration date
 - Common name won't match
   - Verify that your domain matches the common name defined in the certificate
 - Wrong HTTPS port
   - Verify that you port forward the Miniserver Generations 2 port `443` on your router. The external port can be defined as you wish.
   
> **Tip:**<br>Validate your url in the browser, it allows you to easily verify the Certificate against the URL and view the browsers error message.

## Create Browser module
- Execute the `browserify.js` script, it will create the browser modules
````
node ./browserify.js
````

## Set Debug flags
Go to `./vendor/Debug.js` and adopt the flags to your needs.<br>
> **Note:**<br>Don't forget to execute the browserify script every time you make a change in this module!
