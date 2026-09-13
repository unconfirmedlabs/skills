# Effect AI and agent applications

Requires: [HTTP](http.md), [Schema](schema.md), [resilience](resilience.md),
[streams](streams.md). Add [workflows](workflow-and-cluster.md) only for durability.

| Situation | Features |
|---|---|
| Text generation / streaming | `LanguageModel.generateText` / `streamText`; inspect text, usage, finish reason and parts |
| Validated structured output | `LanguageModel.generateObject` with Schema; validate domain constraints beyond JSON shape |
| Multi-turn conversation | `Prompt`, `Chat`; explicit history/import/export and storage/lifetime |
| Callable model tools | `Tool`, `Toolkit`; schema parameters/results, handlers, typed failure modes and approval support |
| Semantic retrieval | `EmbeddingModel`; batch/token limits, vector dimensions and model/version identity |
| Token accounting | `Tokenizer`; provider/model-specific limits, truncation and context budget |
| Multiple provider/config attempts | `Model`, `ExecutionPlan`; bounded total attempts and cost, classify retriable failures |
| MCP serving | `McpServer`, MCP schema/serialization modules; expose a chosen tool/resource/prompt contract and transport |

Provider packages include Anthropic, OpenAI, OpenAI-compatible and OpenRouter.
Read the installed provider's supported model/config types; do not freeze a
fictional or obsolete model id into a general template. Model capabilities differ:
structured output, tools, reasoning parts, embeddings and streaming behavior are
not interchangeable. Provide HttpClient and configuration layers as required.

A model's `.captureRequirements` yields a Layer; an ExecutionPlan's corresponding
operation yields an ExecutionPlan. Supply the right value and compile the chosen
composition. Plan `attempts` means total attempts; retries/fallback can duplicate
expensive calls and tool side effects.

Tool schema validation checks shape, not authority. Expose only capabilities the
application/user has authorized; preserve approval gates for sensitive actions.
Choose tool failure mode and communicate domain errors meaningfully. Typed or
schema-valid model output can still be factually wrong or adversarial. Keep
untrusted retrieved text separate from tool permissions and execution policy.

Chat is mutable conversation state: isolate sessions/tenants and decide how
concurrent turns serialize. Do not describe `Chat` alone as durable; export and
store history explicitly, or use workflow/journal integration with replay rules.
Set loop turn/token/cost/deadline limits and define stop conditions. A `while
(true)` agent loop is not an acceptable production default.

Test with provider/service fakes for malformed objects, partial streams, tool
failure, approval denial, cancellation, rate limiting, retries and budget
exhaustion. Contract tests with a chosen provider are separate and need the
appropriate credentials/cost scope. Record whether model/network behavior was
actually exercised.

Source: pinned `unstable/ai` and `packages/ai` with upstream examples/tests in
[the source inventory](source-and-coverage.md).
