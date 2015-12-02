## yotta Target build tests
[![Circle CI](https://circleci.com/gh/ARMmbed/yotta-target-tests.svg?style=shield&circle-token=bd6f7481ee137c9cd26a8e38015db2df44573180)](https://circleci.com/gh/ARMmbed/yotta-target-tests)

Tests to check each mbed-official gcc yotta target can build a project

### Setup

Use the [example circle yaml](example-circle.yml) to add yotta target builds to your project

### What Happens with Circle CI

* Installs the [yotta Docker image](https://hub.docker.com/r/mbed/yotta/) during build
* npm installs the target test runner app during build
* Uses runner app to run tests which lists targets from the yotta registry and builds each in turn, saving results to test_results.json
* Offers test_results.json as an artifact

### Development Prerequisites

[Node.js](https://nodejs.org)

[Docker](https://www.docker.com/)