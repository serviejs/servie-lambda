import { format } from "url";
import { Response, Headers, createHeaders } from "servie";
import { HttpRequest, HttpRequestOptions } from "servie-http";
import { createBody } from "servie/dist/body/node";
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
 * Extends HTTP requests with AWS lambda context.
 */
export interface LambdaRequestOptions extends HttpRequestOptions {
  context: Context;
}

/**
 * Extends HTTP requests with AWS Lambda context.
 */
export class LambdaRequest extends HttpRequest {
  context: Context;

  constructor(options: LambdaRequestOptions) {
    super(options);
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
    const headers = createHeaders(event.multiValueHeaders);
    const rawBody = event.body
      ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
      : undefined;
    const body = createBody(rawBody);
    let didRespond = false;

    const connection = {
      encrypted: true,
      remoteAddress: event.requestContext.identity.sourceIp
    };

    const req = new LambdaRequest({
      method,
      url,
      connection,
      headers,
      body,
      context
    });

    const mapError = errorhandler(req, {
      log: options.logError,
      production: options.production
    });

    function sendResponse(res: Response): Promise<void> {
      if (didRespond) return Promise.resolve();

      res.started = true;
      req.events.emit("response", res);

      return res.body
        .arrayBuffer()
        .then(buffer => {
          const { statusCode } = res;
          const multiValueHeaders = toMultiValueHeaders(res.allHeaders);
          const isBase64Encoded = isBinary(res);
          const body = Buffer.from(buffer).toString(
            isBase64Encoded ? "base64" : "utf8"
          );

          didRespond = true;

          // Mark the response as finished when buffering is complete.
          res.finished = true;
          res.bytesTransferred = buffer ? buffer.byteLength : 0;

          return callback(null, {
            statusCode,
            multiValueHeaders,
            body,
            isBase64Encoded
          });
        })
        .catch(err => sendResponse(mapError(err)));
    }

    // Handle request and response errors.
    req.events.on("error", (err: Error) => sendResponse(mapError(err)));
    req.events.on("abort", () =>
      sendResponse(new Response({ statusCode: 444 }))
    );

    // Marked request as finished.
    req.started = true;
    req.finished = true;
    req.bytesTransferred = rawBody ? rawBody.byteLength : 0;

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
