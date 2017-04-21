import { format } from 'url'
import { Request, Response, Headers } from 'servie'
import { errorhandler } from 'servie-errorhandler'
import { finalhandler } from 'servie-finalhandler'
import { mask } from 'bit-string-mask'

export type App = (req: Request, next: () => Promise<Response>) => Response | Promise<Response>

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
  return function (event: Event, _context: Context, cb: (err: Error | null, res?: Result) => void): Promise<void> {
    const { httpMethod: method, headers, isBase64Encoded } = event
    const url = format({ pathname: event.path, query: event.queryStringParameters })
    const body = event.body ? new Buffer(event.body, isBase64Encoded ? 'base64' : 'utf8') : undefined
    const isBinary = options.isBinary || (() => false)
    let returned = false

    const connection = {
      encrypted: true,
      remoteAddress: event.requestContext.identity.sourceIp
    }

    const req = new Request({ method, url, connection, headers, body })

    const mapError = errorhandler(req, {
      log: options.logError,
      production: options.production
    })

    function sendError (err: Error) {
      return sendResponse(mapError(err))
    }

    function sendResponse (res: Response): Promise<void> {
      if (returned) {
        return Promise.resolve()
      }

      res.started = true
      req.events.emit('response', res)

      return res.buffer()
        .then((body) => {
          const isBase64Encoded = isBinary(res)

          returned = true

          // Mark the response as finished when buffering is complete.
          res.finished = true
          res.bytesTransferred = body ? body.length : 0

          return cb(null, {
            statusCode: res.status,
            body: body ? (isBase64Encoded ? body.toString('base64') : body.toString('utf8')) : undefined,
            headers: getHeaders(res.headers),
            isBase64Encoded
          })
        })
        .catch((err) => sendError(err))
    }

    // Handle request and response errors.
    req.events.on('error', (err: Error) => sendError(err))
    req.events.on('abort', () => sendResponse(new Response({ status: 444 })))

    // Marked request as finished.
    req.started = true
    req.finished = true
    req.bytesTransferred = body ? body.length : 0

    return Promise.resolve(fn(req, finalhandler(req)))
      .then(
        (res) => sendResponse(res),
        (err) => sendError(err)
      )
  }
}

/**
 * Return a lambda compatible object of headers.
 */
function getHeaders (headers: Headers) {
  const result = Object.create(null)

  if (headers.raw.length) {
    const obj = headers.object()

    for (const key of Object.keys(obj)) {
      const val = obj[key]

      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          result[mask(key, i)] = val[i]
        }
      } else {
        result[key] = val
      }
    }
  }

  return result
}
