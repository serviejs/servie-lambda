# Servie Lambda

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]

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

MIT

[npm-image]: https://img.shields.io/npm/v/servie-lambda.svg?style=flat
[npm-url]: https://npmjs.org/package/servie-lambda
[downloads-image]: https://img.shields.io/npm/dm/servie-lambda.svg?style=flat
[downloads-url]: https://npmjs.org/package/servie-lambda
[travis-image]: https://img.shields.io/travis/blakeembrey/node-servie-lambda.svg?style=flat
[travis-url]: https://travis-ci.org/blakeembrey/node-servie-lambda
[coveralls-image]: https://img.shields.io/coveralls/blakeembrey/node-servie-lambda.svg?style=flat
[coveralls-url]: https://coveralls.io/r/blakeembrey/node-servie-lambda?branch=master
