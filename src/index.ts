import { format } from "url";
import { Response, Headers, createHeaders } from "servie";
import { HttpRequest, HttpRequestOptions } from "servie-http";
import { createBody } from "servie/dist/body/node";
import { errorhandler } from "servie-errorhandler";
import { finalhandler } from "servie-finalhandler";
import { mask } from "bit-string-mask";

/**
 * AWS Lambda event object.
 */
export interface Event {
  path: string;
  httpMethod: string;
  body: string | null;
  isBase64Encoded?: boolean;
  resource: string;
  headers: {
    [key: string]: string;
  } | null;
  queryStringParameters: {
    [key: string]: string;
  } | null;
  pathParameters: {
    [key: string]: string;
  } | null;
  requestContext: {
    identity: {
      sourceIp: string;
    };
  };
}

/**
 * AWS lambda context object.
 *
 * Reference: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 */
export interface Context {
  getRemainingTimeInMillis: () => number;
  callbackWaitsForEmptyEventLoop: boolean;
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  logStreamName: string;
  identity: { cognitoIdentityId: string; cognitoIdentityPoolId: string } | null;
  clientContext: {
    client: {
      installation_id: string;
      app_title: string;
      app_version_name: string;
      app_version_code: string;
      app_package_name: string;
    };
    Custom: any;
    env: {
      platform_version: string;
      platform: string;
      make: string;
      model: string;
      locale: string;
    };
  } | null;
}

/**
 * Standard lambda HTTP response.
 */
export interface Result {
  body?: string;
  statusCode?: number;
  headers?: {
    [key: string]: string | string[];
  };
  isBase64Encoded?: boolean;
}

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
export function createHandler(app: App, options: Options = {}) {
  return function(
    event: Event,
    context: Context,
    cb: (err: Error | null, res: Result) => void
  ): void {
    const { httpMethod: method } = event;
    const url = format({
      pathname: event.path,
      query: event.queryStringParameters
    });
    const isBinary = options.isBinary || (() => false);
    const headers = createHeaders(event.headers);
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
          const headers = toHeaders(res.allHeaders);
          const isBase64Encoded = isBinary(res);
          const body = Buffer.from(buffer).toString(
            isBase64Encoded ? "base64" : "utf8"
          );

          didRespond = true;

          // Mark the response as finished when buffering is complete.
          res.finished = true;
          res.bytesTransferred = buffer ? buffer.byteLength : 0;

          return cb(null, { statusCode, headers, body, isBase64Encoded });
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
function toHeaders(headers: Headers) {
  const result = Object.create(null);
  const obj = headers.asObject();

  for (const key of Object.keys(obj)) {
    const val = obj[key];

    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        result[mask(key, i)] = val[i];
      }
    } else {
      result[key] = val;
    }
  }

  return result;
}
