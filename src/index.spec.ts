import { createServer, Event, Context, Result } from './index'

describe('servie-lambda', () => {
  const event: Event = {
    path: '/test',
    pathParameters: null,
    httpMethod: 'GET',
    body: null,
    resource: '/test',
    headers: null,
    queryStringParameters: null,
    requestContext: {
      identity: {
        sourceIp: ''
      }
    }
  }

  const context: Context = {
    functionName: '',
    functionVersion: '$LATEST',
    memoryLimitInMB: '128',
    invokeid: '',
    awsRequestId: '',
    invokedFunctionArn: ''
  }

  it('should support routers', (done) => {
    const handler = createServer(function (_req, res) {
      res.status = 200
      res.body = 'response'

      return Promise.resolve()
    })

    return handler(event, context, (err: Error | null, res: Result) => {
      if (err) {
        return done(err)
      }

      expect(res).toEqual({
        statusCode: 200,
        body: 'response',
        headers: {
          'content-type': 'text/plain',
          'content-length': '8'
        },
        isBase64Encoded: false
      })

      return done()
    })
  })

  it('should fall through to 404', (done) => {
    const handler = createServer((_req, _res, next) => next())

    return handler(event, context, (err: Error | null, res: Result) => {
      if (err) {
        return done(err)
      }

      expect(res).toEqual({
        statusCode: 404,
        body: 'Cannot GET /test',
        headers: {
          'content-type': 'text/plain',
          'content-length': '16'
        },
        isBase64Encoded: false
      })

      return done()
    })
  })
})
