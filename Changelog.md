# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0]
## New
- Support for SHA256 based hashes when communicating with the Minserver
- Support for Miniserver Generation 2 using TLS (HTTPS/WSS)

## [1.0.1] - 2019-07-23
### Fixed
- Automatic Token refresh didn't work
- Node.js crashes due to missing Object.value() function
- Implemented new JWT (JSON Web Token) handling
- Fixed HTTPS websocket handling

## [1.0.0] - 2018-06-06
### Fixed
- CloudDNS URL couldn't be resolved to an IP on node.js
- Alternative CloudDNS URL couldn't be detected as a CloudDNS URL thus the external IP couldn't be resolved

## [0.9.0]
- Initial release
