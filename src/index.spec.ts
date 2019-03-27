import { Response, createHeaders } from "servie";
import { createBody } from "servie/dist/body/node";
import { createHandler, Event, Context, Result } from "./index";

describe("servie-lambda", () => {
  const event: Event = {
    path: "/test",
    pathParameters: null,
    httpMethod: "GET",
    body: null,
    resource: "/test",
    headers: {},
    multiValueHeaders: {
      Test: ["a", "b", "c"]
    },
    isBase64Encoded: false,
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    stageVariables: {},
    requestContext: {
      identity: {
        sourceIp: "127.0.0.1"
      }
    } as any
  };

  const context = ({
    functionName: "",
    functionVersion: "$LATEST",
    memoryLimitInMB: "128"
  } as any) as Context;

  it("should support routers", done => {
    const handler = createHandler(function() {
      return Promise.resolve(
        new Response({
          statusCode: 200,
          body: createBody("response")
        })
      );
    });

    return handler(event, context, (err, res) => {
      if (err) return done(err);

      expect(res).toEqual({
        statusCode: 200,
        body: "response",
        multiValueHeaders: {
          "Content-Type": ["text/plain"],
          "Content-Length": ["8"]
        },
        isBase64Encoded: false
      });

      return done();
    });
  });

  it("should fall through to 404", done => {
    const handler = createHandler((_req, next) => next());

    return handler(event, context, (err, res) => {
      if (err) return done(err);

      expect(res).toEqual({
        statusCode: 404,
        body: "Cannot GET /test",
        multiValueHeaders: {
          "Content-Type": ["text/plain"],
          "Content-Security-Policy": ["default-src 'self'"],
          "X-Content-Type-Options": ["nosniff"],
          "Content-Length": ["16"]
        },
        isBase64Encoded: false
      });

      return done();
    });
  });

  it("should support multiple headers of the same key", done => {
    const handler = createHandler(() => {
      return new Response({
        headers: createHeaders({
          "Set-Cookie": ["a=a", "b=b", "c=c"]
        })
      });
    });

    return handler(event, context, (err, res) => {
      if (err) return done(err);

      expect(res).toEqual({
        statusCode: 200,
        body: "",
        multiValueHeaders: {
          "Set-Cookie": ["a=a", "b=b", "c=c"]
        },
        isBase64Encoded: false
      });

      return done();
    });
  });

  it("should log and rewrite errors", done => {
    const logError = jest.fn();
    const handler = createHandler(() => Promise.reject(new Error("boom")), {
      logError
    });

    return handler(event, context, (err, res) => {
      if (err) return done(err);

      expect(res!.statusCode).toEqual(500);
      expect(res!.isBase64Encoded).toEqual(false);
      expect(res!.body).toContain("boom");
      expect(logError).toHaveBeenCalled();

      return done();
    });
  });
});
