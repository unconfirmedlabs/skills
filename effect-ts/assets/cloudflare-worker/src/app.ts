import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as HttpRouter from "effect/unstable/http/HttpRouter"
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import { AppConfig, type AppServices } from "./services"

class HttpFailure extends Schema.TaggedError<HttpFailure>()("HttpFailure", {
  status: Schema.Int,
  code: Schema.String,
  message: Schema.String
}) {}

const GreetingParams = Schema.Struct({
  name: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(64),
    Schema.isPattern(/^[A-Za-z0-9_-]+$/)
  )
})

type RouteParams = Readonly<Record<string, string | undefined>>
type RouteProgram = (
  request: Request,
  params: RouteParams
) => Effect.Effect<Response, HttpFailure, AppServices>

const jsonResponse = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    }
  })

const errorResponse = (failure: HttpFailure): Response => {
  const response = jsonResponse(
    { error: { code: failure.code, message: failure.message } },
    failure.status
  )
  if (failure.status === 405) {
    response.headers.set("Allow", "GET, HEAD, OPTIONS")
  }
  return response
}

const internalErrorResponse = (): Response =>
  jsonResponse(
    { error: { code: "internal_error", message: "Internal server error" } },
    500
  )

const fromWebResponse = (
  response: Response
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.raw(response, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })

const routeHandler =
  (program: RouteProgram) =>
  (serverRequest: HttpServerRequest.HttpServerRequest) => {
    const request = serverRequest.source as Request
    const url = new URL(request.url)

    return HttpRouter.params.pipe(
      Effect.flatMap((params) => program(request, params)),
      Effect.catchTag("HttpFailure", (failure) => Effect.succeed(errorResponse(failure))),
      Effect.map(fromWebResponse),
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause) ? Effect.failCause(cause) : Effect.logError("Unhandled route defect", cause).pipe(
          Effect.as(fromWebResponse(internalErrorResponse()))
        )
      ),
      Effect.annotateLogs({ method: request.method, pathname: url.pathname }),
      Effect.withLogSpan("worker.http")
    )
  }

const readRoutes = (path: HttpRouter.PathInput, program: RouteProgram) => {
  const handler = routeHandler(program)
  return [
    HttpRouter.route("GET", path, handler),
    HttpRouter.route("HEAD", path, handler)
  ] as const
}

const health = Effect.fn("worker.health")(function*() {
  const { appName } = yield* AppConfig
  return jsonResponse({ service: appName, status: "ok" })
})

const greet = Effect.fn("worker.greet")(function*(params: RouteParams) {
  const { name } = yield* Schema.decodeUnknownEffect(GreetingParams)(params).pipe(
    Effect.mapError(
      () =>
        new HttpFailure({
          status: 400,
          code: "invalid_name",
          message: "Name must be 1-64 letters, digits, underscores, or hyphens"
        })
    )
  )
  const { appName } = yield* AppConfig
  return jsonResponse({ message: `Hello, ${name}!`, service: appName })
})

const notFound = new HttpFailure({
  status: 404,
  code: "not_found",
  message: "Route not found"
})

const methodNotAllowed = new HttpFailure({
  status: 405,
  code: "method_not_allowed",
  message: "Method not allowed"
})

const ALLOWED_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

const responseForRequest = (request: Request, response: Response): Response =>
  request.method === "HEAD"
    ? new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    : response

const publicErrorResponse = (request: Request, failure: HttpFailure): Response => {
  const response = errorResponse(failure)
  return responseForRequest(request, response)
}

export const internalErrorResponseFor = (request: Request): Response =>
  responseForRequest(request, internalErrorResponse())

export const normalizeRouterResponse = (
  request: Request,
  response: Response
): Response => {
  if (!ALLOWED_METHODS.has(request.method)) {
    return publicErrorResponse(request, methodNotAllowed)
  }
  if (response.status === 404 && !response.headers.has("Cache-Control")) {
    return publicErrorResponse(request, notFound)
  }
  return response
}

const preflight = (): Response =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store"
    }
  })

const Routes = HttpRouter.addAll([
  ...readRoutes("/health", () => health()),
  ...readRoutes("/v1/hello/:name", (_request, params) => greet(params)),
  HttpRouter.route(
    "OPTIONS",
    "*",
    routeHandler(() => Effect.succeed(preflight()))
  ),
  ...(["PUT", "POST", "PATCH", "DELETE"] as const).map((method) =>
    HttpRouter.route(method, "*", routeHandler(() => Effect.fail(methodNotAllowed)))
  ),
  HttpRouter.route("GET", "*", routeHandler(() => Effect.fail(notFound))),
  HttpRouter.route("HEAD", "*", routeHandler(() => Effect.fail(notFound)))
])

export const { handler: webHandler } = HttpRouter.toWebHandler(Routes, {
  disableLogger: true
})
