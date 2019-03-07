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
    headers: null,
    queryStringParameters: null,
    requestContext: {
      identity: {
        sourceIp: ""
      }
    }
  };

  const context = {
    functionName: "",
    functionVersion: "$LATEST",
    memoryLimitInMB: "128"
  } as Context;

  it("should support routers", done => {
    const handler = createHandler(function() {
      return Promise.resolve(
        new Response({
          statusCode: 200,
          body: createBody("response")
        })
      );
    });

    return handler(event, context, (err: Error | null, res: Result) => {
      if (err) {
        return done(err);
      }

      expect(res).toEqual({
        statusCode: 200,
        body: "response",
        headers: {
          "content-type": "text/plain",
          "content-length": "8"
        },
        isBase64Encoded: false
      });

      return done();
    });
  });

  it("should fall through to 404", done => {
    const handler = createHandler((_req, next) => next());

    return handler(event, context, (err: Error | null, res: Result) => {
      if (err) {
        return done(err);
      }

      expect(res).toEqual({
        statusCode: 404,
        body: "Cannot GET /test",
        headers: {
          "content-type": "text/plain",
          "content-security-policy": "default-src 'self'",
          "x-content-type-options": "nosniff",
          "content-length": "16"
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

    return handler(event, context, (err: Error | null, res: Result) => {
      if (err) {
        return done(err);
      }

      expect(res).toEqual({
        statusCode: 200,
        body: "",
        headers: {
          "set-cookie": "a=a",
          "Set-cookie": "b=b",
          "sEt-cookie": "c=c"
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

    return handler(event, context, (err: Error | null, res: Result) => {
      if (err) {
        return done(err);
      }

      expect(res.statusCode).toEqual(500);
      expect(res.isBase64Encoded).toEqual(false);
      expect(res.body).toContain("boom");
      expect(logError).toHaveBeenCalled();

      return done();
    });
  });
});
