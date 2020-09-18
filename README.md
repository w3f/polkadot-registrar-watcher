[![CircleCI](https://circleci.com/gh/w3f/polkadot-registrar-watcher.svg?style=svg)](https://circleci.com/gh/w3f/polkadot-registrar-watcher)

# polkadot-registrar-watcher

This application is the watcher module of the polkadot-registrar application.  
You can find the challenger module here: https://github.com/w3f/polkadot-registrar-challenger

## Application Architecture

![architecture](assets/architecture.png)

## How to Run 

### Requirements
- yarn: https://classic.yarnpkg.com/en/docs/install/

```bash
git clone https://github.com/w3f/polkadot-registrar-watcher.git
cd polkadot-registrar-watcher
cp config/main.sample.yaml config/main.yaml 
#just the fist time

yarn
yarn build
yarn start
```