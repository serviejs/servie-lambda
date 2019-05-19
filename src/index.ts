import { format } from "url";
import { Request, Response, Headers, RequestOptions } from "servie/dist/node";
import { errorhandler } from "servie-errorhandler";
import { finalhandler } from "servie-finalhandler";
import {
  APIGatewayEvent as Event,
  APIGatewayProxyHandler as Handler,
  APIGatewayProxyResult as Result,
  Context
} from "aws-lambda";

export { Handler, Event, Context, Result };

/**
 * Extends `Request` with AWS lambda context.
 */
export interface LambdaRequestOptions extends RequestOptions {
  context: Context;
}

/**
 * Extends HTTP requests with AWS Lambda context.
 */
export class LambdaRequest extends Request {
  context: Context;

  constructor(input: string | LambdaRequest, options: LambdaRequestOptions) {
    super(input, options);
    this.context = options.context;
  }
}

/**
 * Valid AWS lambda server signature.
 */
export type App = (
  req: LambdaRequest,
  next: () => Promise<Response>
) => Response | Promise<Response>;

/**
 * Lambda server options.
 */
export interface Options {
  isBinary?: (res: Response) => boolean;
  logError?: (err: Error) => void;
  production?: boolean;
}

/**
 * Create a server for handling AWS Lambda requests.
 */
export function createHandler(app: App, options: Options = {}): Handler {
  return function(event, context, callback): void {
    const { httpMethod: method } = event;
    const url = format({
      pathname: event.path,
      query: event.multiValueQueryStringParameters
    });
    const isBinary = options.isBinary || (() => false);
    const body = event.body
      ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
      : undefined;
    let didRespond = false;

    const req = new LambdaRequest(url, {
      headers: event.multiValueHeaders,
      method,
      body,
      context
    });

    const mapError = errorhandler(req, {
      log: options.logError,
      production: options.production
    });

    function sendResponse(res: Response): Promise<void> {
      if (didRespond) return Promise.resolve();

      req.signal.emit("responseStarted");

      return res.buffer().then(
        buffer => {
          const { status: statusCode } = res;
          const multiValueHeaders = toMultiValueHeaders(res.headers);
          const isBase64Encoded = isBinary(res);
          const body = buffer.toString(isBase64Encoded ? "base64" : "utf8");

          didRespond = true;

          // Emit stats at end of response.
          req.signal.emit("responseBytes", buffer ? buffer.byteLength : 0);
          req.signal.emit("responseEnded");

          return callback(null, {
            statusCode,
            multiValueHeaders,
            body,
            isBase64Encoded
          });
        },
        err => sendResponse(mapError(err))
      );
    }

    req.signal.on("abort", () =>
      sendResponse(new Response(null, { status: 444 }))
    );

    // Marked request as finished.
    req.signal.emit("requestStarted");
    req.signal.emit("requestBytes", body ? body.byteLength : 0);
    req.signal.emit("requestStarted");

    Promise.resolve(app(req, finalhandler(req))).then(
      res => sendResponse(res),
      err => sendResponse(mapError(err))
    );
  };
}

/**
 * Return a lambda compatible object of headers.
 */
function toMultiValueHeaders(headers: Headers) {
  const result: NonNullable<Result["multiValueHeaders"]> = Object.create(null);
  for (const key of headers.keys()) result[key] = headers.getAll(key);
  return result;
}
