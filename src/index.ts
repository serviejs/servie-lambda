import { format } from 'url'
import { Request, Response } from 'servie'

export type Middleware = (req: Request, res: Response, next: () => Promise<void>) => Promise<void>

/**
 * AWS Lambda event object.
 */
export interface Event {
  path: string
  httpMethod: string
  body: string | null
  isBase64Encoded?: boolean
  resource: string
  headers: {
    [key: string]: string
  } | null
  queryStringParameters: {
    [key: string]: string
  } | null
  pathParameters: {
    [key: string]: string
  } | null
  requestContext: {
    identity: {
      sourceIp: string
    }
  }
}

/**
 * AWS lambda context object.
 */
export interface Context {
  functionName: string
  memoryLimitInMB: string
  functionVersion: string
  invokeid: string
  awsRequestId: string
  invokedFunctionArn: string
}

/**
 * Standard lambda HTTP response.
 */
export interface Result {
  body?: string
  statusCode?: number
  headers?: {
    [key: string]: string | string[]
  }
  isBase64Encoded?: boolean
}

/**
 * Lambda server options.
 */
export interface Options {
  isBinary?: (res: Response) => boolean
}

/**
 * Create a server for handling AWS Lambda requests.
 */
export function createServer (fn: Middleware, options: Options = {}) {
  return function (event: Event, _context: Context, cb: (err: Error | null, res?: Result) => void): void {
    const { httpMethod: method, headers, isBase64Encoded } = event
    const url = format({ pathname: event.path, query: event.queryStringParameters })
    const body = event.body ? new Buffer(event.body, isBase64Encoded ? 'base64' : 'utf8') : undefined

    const connection = { encrypted: true, remoteAddress: event.requestContext.identity.sourceIp }

    const request = new Request({ method, url, connection, headers, body })
    const response = new Response(request, {})

    // Handle request and response errors.
    request.events.on('error', done)
    response.events.on('error', done)

    // Marked request as finished.
    request.started = true
    request.finished = true
    request.bytesTransferred = body ? body.length : 0

    function done (err: Error | null, res?: Result) {
      if (err && (request.aborted || response.started)) {
        console.error(err)
        return
      }

      response.started = true
      response.finished = true

      return cb(err, res)
    }

    fn(request, response, finalhandler(request, response))
      .then((): void | Promise<void> => {
        if (request.aborted || response.started) {
          return
        }

        return response.buffer().then((body) => {
          const isBase64Encoded = options.isBinary ? options.isBinary(response) : false

          // Set bytes transferred.
          response.bytesTransferred = body ? body.length : 0

          return done(null, {
            statusCode: response.status,
            body: body ? (isBase64Encoded ? body.toString('base64') : body.toString('utf8')) : undefined,
            headers: response.headers.object(),
            isBase64Encoded
          })
        })
      })
      .catch((err) => done(err))
  }
}

/**
 * Final throwback server handler.
 */
function finalhandler (req: Request, res: Response) {
  return function () {
    res.status = 404
    res.type = 'text/plain'
    res.body = `Cannot ${req.method} ${req.url}`

    return Promise.resolve()
  }
}
