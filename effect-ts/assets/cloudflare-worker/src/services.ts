import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const RuntimeBindings = Schema.Struct({
  APP_NAME: Schema.NonEmptyString
})

export class ConfigFailure extends Schema.TaggedError<ConfigFailure>()(
  "ConfigFailure",
  { cause: Schema.Defect() }
) {}

export class AppConfig extends Context.Service<
  AppConfig,
  { readonly appName: string }
>()("effect-cloudflare-worker/AppConfig") {}

export type AppServices = AppConfig

export const contextFromBindings = Effect.fn("worker.contextFromBindings")(
  function*(bindings: CloudflareBindings) {
    const decoded = yield* Schema.decodeUnknownEffect(RuntimeBindings)(bindings).pipe(
      Effect.mapError((cause) => new ConfigFailure({ cause }))
    )

    return Context.make(AppConfig, { appName: decoded.APP_NAME })
  }
)
