import { format } from "url";
import { Request, Response, Headers, RequestOptions } from "servie/dist/node";
import { errorhandler } from "servie-errorhandler";
import { finalhandler } from "servie-finalhandler";
import {
  APIGatewayEvent as Event,
  APIGatewayProxyResult as Result,
  Context
} from "aws-lambda";

export { Event, Context, Result };

/**
 * AWS Lambda promise handler.
 */
export type Handler = (event: Event, context: Context) => Promise<Result>;

/**
 * Extends `Request` with AWS lambda context.
 */
export interface LambdaRequestOptions extends RequestOptions {
  context: Context;
  event: Event;
}

/**
 * Extends HTTP requests with AWS Lambda context.
 */
export class LambdaRequest extends Request {
  context: Context;
  event: Event;

  constructor(input: string | LambdaRequest, options: LambdaRequestOptions) {
    super(input, options);
    this.context = options.context;
    this.event = options.event;
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
  return function(event, context): Promise<Result> {
    const { httpMethod: method } = event;
    const url = format({
      pathname: event.path,
      query: event.multiValueQueryStringParameters
    });
    const isBinary = options.isBinary || (() => false);
    const body = event.body
      ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
      : undefined;

    const req = new LambdaRequest(url, {
      headers: event.multiValueHeaders,
      omitDefaultHeaders: true,
      method,
      body,
      context,
      event
    });

    const mapError = errorhandler(req, {
      log: options.logError,
      production: options.production
    });

    function sendResponse(res: Response): Promise<Result> {
      req.signal.emit("responseStarted");

      return res.buffer().then(
        buffer => {
          const { status: statusCode } = res;
          const multiValueHeaders = toMultiValueHeaders(res.headers);
          const isBase64Encoded = isBinary(res);
          const body = buffer.toString(isBase64Encoded ? "base64" : "utf8");

          // Emit stats at end of response.
          req.signal.emit("responseBytes", buffer ? buffer.byteLength : 0);
          req.signal.emit("responseEnded");

          return {
            statusCode,
            multiValueHeaders,
            body,
            isBase64Encoded
          };
        },
        err => sendResponse(mapError(err))
      );
    }

    // Marked request as finished.
    req.signal.emit("requestStarted");
    req.signal.emit("requestBytes", body ? body.byteLength : 0);
    req.signal.emit("requestStarted");

    return new Promise(resolve => {
      let result: Promise<Result> | undefined;

      req.signal.on("abort", () => {
        result = sendResponse(new Response(null, { status: 444 }));
        return resolve(result);
      });

      return resolve(
        Promise.resolve(app(req, finalhandler(req))).then(
          res => result || sendResponse(res),
          err => result || sendResponse(mapError(err))
        )
      );
    });
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
