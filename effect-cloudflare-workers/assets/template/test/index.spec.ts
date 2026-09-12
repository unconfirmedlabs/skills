import { env, exports } from "cloudflare:workers"
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import worker from "../src/index"

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>

describe("Effect Cloudflare Worker", () => {
  it("runs the exported handler with request-scoped bindings", async () => {
    const ctx = createExecutionContext()
    const response = await worker.fetch(
      new IncomingRequest("https://example.com/health"),
      env,
      ctx
    )
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toEqual({
      service: "effect-cloudflare-worker",
      status: "ok"
    })
  })

  it("validates route parameters with Effect Schema", async () => {
    const response = await exports.default.fetch("https://example.com/v1/hello/not%20valid")

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_name",
        message: "Name must be 1-64 letters, digits, underscores, or hyphens"
      }
    })
  })

  it("validates deployed configuration without exposing its cause", async () => {
    const ctx = createExecutionContext()
    const response = await worker.fetch(
      new IncomingRequest("https://example.com/health"),
      { APP_NAME: "" } as unknown as CloudflareBindings,
      ctx
    )
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(500)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect(await response.json()).toEqual({
      error: { code: "internal_error", message: "Internal server error" }
    })
  })

  it("keeps failures outside the router bodyless for HEAD", async () => {
    const ctx = createExecutionContext()
    const response = await worker.fetch(
      new IncomingRequest("https://example.com/health", { method: "HEAD" }),
      { APP_NAME: "" } as unknown as CloudflareBindings,
      ctx
    )
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(500)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect((await response.arrayBuffer()).byteLength).toBe(0)
  })

  it("keeps GET and HEAD metadata aligned without a HEAD body", async () => {
    const url = "https://example.com/v1/hello/Effect"
    const [get, head] = await Promise.all([
      exports.default.fetch(url),
      exports.default.fetch(url, { method: "HEAD" })
    ])

    expect(get.status).toBe(200)
    expect(head.status).toBe(get.status)
    expect(head.headers.get("Content-Type")).toBe(get.headers.get("Content-Type"))
    expect((await head.arrayBuffer()).byteLength).toBe(0)
    expect(await get.json()).toEqual({
      message: "Hello, Effect!",
      service: "effect-cloudflare-worker"
    })
  })

  it.each([
    ["GET", "/missing", 404, "not_found"],
    ["POST", "/health", 405, "method_not_allowed"],
    ["TRACE", "/health", 405, "method_not_allowed"]
  ])("returns a stable error for %s %s", async (method, path, status, code) => {
    const response = await exports.default.fetch(`https://example.com${path}`, { method })
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(status)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(body.error.code).toBe(code)
    if (status === 405) {
      expect(response.headers.get("Allow")).toBe("GET, HEAD, OPTIONS")
    }
  })

  it.each(["/v1/hello/%", "/v1/hello/%FF"])(
    "normalizes router failures for malformed path %s",
    async (path) => {
      const response = await exports.default.fetch(`https://example.com${path}`)

      expect(response.status).toBe(404)
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
      expect(response.headers.get("Cache-Control")).toBe("no-store")
      expect(await response.json()).toEqual({
        error: { code: "not_found", message: "Route not found" }
      })
    }
  )

  it("answers CORS preflight explicitly", async () => {
    const response = await exports.default.fetch("https://example.com/v1/hello/Effect", {
      method: "OPTIONS"
    })

    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, HEAD, OPTIONS"
    )
    expect(await response.text()).toBe("")
  })
})
