import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
  internalErrorResponseFor,
  normalizeRouterResponse,
  webHandler
} from "./app"
import { contextFromBindings } from "./services"

class DispatchFailure extends Schema.TaggedError<DispatchFailure>()(
  "DispatchFailure",
  { cause: Schema.Defect() }
) {}

const dispatch = Effect.fn("worker.dispatch")(function*(
  request: Request,
  bindings: CloudflareBindings
) {
  const context = yield* contextFromBindings(bindings)
  const response = yield* Effect.tryPromise({
    try: (signal) => webHandler(new Request(request, { signal }), context),
    catch: (cause) => new DispatchFailure({ cause })
  })
  return normalizeRouterResponse(request, response)
})

export function handleRequest(
  request: Request,
  bindings: CloudflareBindings
): Promise<Response> {
  const url = new URL(request.url)
  return Effect.runPromise(
    dispatch(request, bindings).pipe(
      Effect.catch((failure) =>
        Effect.logError("Worker request failed", failure).pipe(
          Effect.as(internalErrorResponseFor(request))
        )
      ),
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause) ? Effect.failCause(cause) : Effect.logError("Unhandled Worker defect", cause).pipe(
          Effect.as(internalErrorResponseFor(request))
        )
      ),
      Effect.annotateLogs({ method: request.method, pathname: url.pathname }),
      Effect.withLogSpan("worker.request")
    ),
    { signal: request.signal }
  )
}

export default {
  fetch(request, env, _ctx) {
    return handleRequest(request, env)
  }
} satisfies ExportedHandler<CloudflareBindings>
