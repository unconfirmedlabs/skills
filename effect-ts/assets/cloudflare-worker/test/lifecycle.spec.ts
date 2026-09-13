import { env } from "cloudflare:workers"
import { createExecutionContext } from "cloudflare:test"
import { expect, it } from "vitest"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as HttpEffect from "effect/unstable/http/HttpEffect"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import worker from "../src/index"

it("preserves already-aborted invocation cancellation", async () => {
  const controller = new AbortController()
  controller.abort()
  const request = new Request<unknown, IncomingRequestCfProperties>("https://example.test/health", { signal: controller.signal })
  await expect(worker.fetch(request, env, createExecutionContext())).rejects.toBeDefined()
})

it("keeps an Effect response scope alive until its stream is cancelled", async () => {
  let released = false
  const handler = HttpEffect.toWebHandler(Effect.gen(function*() {
    yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => { released = true }))
    return HttpServerResponse.stream(Stream.concat(
      Stream.succeed(new Uint8Array([0, 1, 254, 255])), Stream.never
    ))
  }))
  const response = await handler(new Request("https://example.test/stream"))
  expect(released).toBe(false)
  const reader = response.body!.getReader()
  expect((await reader.read()).value).toEqual(new Uint8Array([0, 1, 254, 255]))
  await reader.cancel()
  expect(released).toBe(true)
})

it("reconstructs mutable headers when adapting an immutable native redirect", () => {
  const original = Response.redirect("https://example.test/next", 302)
  const owned = new Response(original.body, {
    status: original.status, statusText: original.statusText, headers: original.headers
  })
  const response = HttpServerResponse.toWeb(HttpServerResponse.raw(owned, {
    status: owned.status, headers: owned.headers
  }))
  expect(response.status).toBe(302)
  expect(response.headers.get("Location")).toBe("https://example.test/next")
})
