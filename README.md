# Servie Lambda

[![NPM version](https://img.shields.io/npm/v/servie-lambda.svg?style=flat)](https://npmjs.org/package/servie-lambda)
[![NPM downloads](https://img.shields.io/npm/dm/servie-lambda.svg?style=flat)](https://npmjs.org/package/servie-lambda)
[![Build status](https://img.shields.io/travis/serviejs/servie-lambda.svg?style=flat)](https://travis-ci.org/serviejs/servie-lambda)
[![Test coverage](https://img.shields.io/coveralls/serviejs/servie-lambda.svg?style=flat)](https://coveralls.io/r/serviejs/servie-lambda?branch=master)

> Servie transport for AWS lambda proxy.

## Installation

```
npm install servie-lambda --save
```

## Usage

Wrap a standard Servie middleware function in `createHandler` to return a AWS Lambda handler.

```ts
import { createHandler } from 'servie-lambda'
import { compose } from 'throwback'
import { get } from 'servie-route'

export const handler = createHandler(compose([
  get('/test', (req) => new Response({ body: 'hello world' }))
]))
```

## TypeScript

This project is written using [TypeScript](https://github.com/Microsoft/TypeScript) and publishes the definitions directly to NPM.

## License

Apache 2.0
