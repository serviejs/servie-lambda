import { Response } from 'servie'
import { createHandler, Event, Context, Result } from './index'

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
    const handler = createHandler(function (req) {
      return Promise.resolve(new Response(req, {
        status: 200,
        body: 'response'
      }))
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
    const handler = createHandler((_req, next) => next())

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

  it('should log and rewrite errors', (done) => {
    const logError = jest.fn()
    const handler = createHandler(() => Promise.reject(new Error('boom')), { logError })

    return handler(event, context, (err: Error | null, res: Result) => {
      if (err) {
        return done(err)
      }

      expect(res.statusCode).toEqual(500)
      expect(res.isBase64Encoded).toEqual(false)
      expect(res.body).toContain('boom')
      expect(logError).toHaveBeenCalled()

      return done()
    })
  })
})
