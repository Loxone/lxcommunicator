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

## Establish a connection with SSL (`https://` and `wss://`)
- HTTPS connection is *only* supported when using on the Miniserver v2
- If no custom certificate is used all Loxone CloudDNS URLs will automatically resolve to use SSL if available
- If the Internal IP or External IP or any other Domain name is used HTTPS is not automatically chosen

**Establish a local SSL connection**
- If the Miniserver v2 is using the Loxone Cloud DNS
  - It is mandatory to enter the URL in the following format to ensure the SSL certificate matches the domain. This prevents the `ERR_CERT_COMMON_NAME_INVALID` error.
 
 | IP of the Miniserver | Serial Number of the Miniserver | Resulting URL                                           |
 |:---------------------|:--------------------------------|:--------------------------------------------------------|
 | 89.23.45.12          | 504f94a00001                    | https://89-23-45-12.504f94a00001.dyndns.loxonecloud.com |
 
 **Common issues when using SSL (`https://` and `wss://`)**
 - Expired Certificate
   - Verify your expiration date
 - Common name won't match
   - Verify that your domain matches the common name defined in the certificate
 - Wrong HTTPS port
   - Verify that you port forward the Miniservers v2 port `443` on your router. The external port can be defined as you wish.
   
> **Tip:**<br>Validate your url in the browser, it allows you to verify the SSL Certificate against the URL and view the browsers error message.

## Create Browser module
- Execute the `browserify.js` script, it will create the browser modules
````
node ./browserify.js
````

## Set Debug flags
Go to `./vendor/Debug.js` and adopt the flags to your needs.<br>
> **Note:**<br>Don't forget to execute the browserify script every time you make a change in this module!
