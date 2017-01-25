import { format } from 'url'
import { Request, Response } from 'servie'
import { STATUS_CODES } from 'http'

export type App = (req: Request, next: () => Promise<Response>) => Promise<Response>

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
  logError?: (err: Error) => void
  production?: boolean
}

/**
 * Create a server for handling AWS Lambda requests.
 */
export function createHandler (fn: App, options: Options = {}) {
  return function (event: Event, _context: Context, cb: (err: Error | null, res?: Result) => void): void {
    const { httpMethod: method, headers, isBase64Encoded } = event
    const url = format({ pathname: event.path, query: event.queryStringParameters })
    const body = event.body ? new Buffer(event.body, isBase64Encoded ? 'base64' : 'utf8') : undefined
    const logError = options.logError || ((err: Error) => console.error(err))
    const production = options.production == null ? (process.env['NODE_ENV'] === 'production') : options.production
    let returned = false

    const connection = {
      encrypted: true,
      remoteAddress: event.requestContext.identity.sourceIp
    }

    const req = new Request({ method, url, connection, headers, body })

    // Handle request and response errors.
    req.events.on('error', done)
    req.events.on('abort', () => done(null, { statusCode: 444 }))

    // Marked request as finished.
    req.started = true
    req.finished = true
    req.bytesTransferred = body ? body.length : 0

    function done (err: Error | null, res?: Result) {
      returned = true

      if (err) {
        logError(err)

        return cb(null, mapError(err, production))
      }

      return cb(null, res)
    }

    fn(req, finalhandler(req))
      .then((response): void | Promise<void> => {
        if (returned) {
          return
        }

        response.started = true

        return response.buffer().then((body) => {
          const isBase64Encoded = options.isBinary ? options.isBinary(response) : false

          response.finished = true
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
 * Map a request error to lambda.
 */
function mapError (err: any, production: boolean): Result {
  const status = err.status || 500
  const body = (production ? STATUS_CODES[status] : (err.stack || String(err))) || ''

  return {
    statusCode: status,
    headers: {
      'content-type': 'text/plain',
      'content-length': String(Buffer.byteLength(body))
    },
    body: body,
    isBase64Encoded: false
  }
}

/**
 * Final throwback server handler.
 */
function finalhandler (req: Request) {
  return function () {
    return Promise.resolve(new Response({
      status: 404,
      body: `Cannot ${req.method} ${req.url}`
    }))
  }
}
