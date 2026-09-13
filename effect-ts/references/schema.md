# Schema: models, validation, codecs, typed errors

Requires: [core](core.md). Code blocks with undefined domain names are API sketches;
verify exact overloads in [source and coverage](source-and-coverage.md).

`Schema.Codec<Type, Encoded, DecodingServices, EncodingServices>`. Decoding
turns untrusted `Encoded` (JSON, strings, rows) into `Type`; encoding reverses
it. Every boundary decodes; domain code only sees `Type`. v4 renamed most of
the v3 surface; the names below are verified against `effect@4.0.0-rc.115`.

## Building schemas

```ts
import { Schema } from "effect"

Schema.String, Schema.Number, Schema.Boolean, Schema.Int, Schema.Natural, Schema.Finite, Schema.BigInt
Schema.NonEmptyString, Schema.Trim /* trims on decode */, Schema.NumberFromString, Schema.FiniteFromString
Schema.Literal("a"); Schema.Literals(["a", "b"])          // Literal takes ONE value; Literals takes an array
Schema.Struct({ id: Schema.Int, name: Schema.String, tags: Schema.optionalKey(Schema.Array(Schema.String)) })
Schema.optionalKey(S)   // key may be absent          -> { k?: T }
Schema.optional(S)      // absent or undefined        -> { k?: T | undefined }
Schema.mutableKey(S), Schema.NullOr(S), Schema.UndefinedOr(S), Schema.NullishOr(S)
Schema.Array(S); Schema.NonEmptyArray(S); Schema.Tuple([A, B]); Schema.Record(Schema.String, S)
Schema.Union([A, B], { mode: "anyOf" | "oneOf" })         // array argument
Schema.ReadonlyMap(K, V); Schema.ReadonlySet(V); Schema.HashMap(K, V); Schema.Option(S); Schema.OptionFromNullOr(S)
Schema.Date; Schema.DateFromString; Schema.DateTimeUtc; Schema.DateTimeUtcFromString; Schema.DateTimeUtcFromMillis; Schema.URL; Schema.URLFromString
Schema.Redacted(S) /* input already Redacted */; Schema.RedactedFromValue(S) /* wraps raw value */
Schema.Unknown; Schema.Any; Schema.Never; Schema.Void; Schema.Defect()  /* unknown thrown values */
Schema.fromJsonString(S)                                 // string <-> S (was parseJson)
Schema.suspend((): Schema.Codec<Tree> => Tree)           // recursion
```

Classes (validated value types with a constructor and static codec; add brands/private fields when nominal identity is needed):

```ts
class User extends Schema.Class<User>("app/User")({ id: UserId, name: Schema.NonEmptyString, role: Schema.Literals(["admin", "member"]) }) {
  get isAdmin() { return this.role === "admin" }
}
new User({ id, name, role })           // validates, throws on failure
User.make(input) / User.makeOption(input) / User.makeEffect(input)
class Dog extends User.extend<Dog>("Dog")({ breed: Schema.String }) {}
class Circle extends Schema.TaggedClass<Circle>()("Circle", { r: Schema.Number }) {}   // _tag field, not yieldable
```

Types: `typeof User.Type`, `typeof User.Encoded`, `Schema.Schema.Type<typeof S>`,
`Schema.Codec.Encoded<typeof S>`. Branded ids:

```ts
const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type
UserId.make("u_1")     // validates + brands
const PositiveInt = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)), Schema.brand("PositiveInt"))
```

## Checks (refinements)

```ts
Schema.String.pipe(Schema.check(Schema.isMinLength(3), Schema.isPattern(/^[a-z]+$/, { message: "lowercase only" })))
Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 100 })))
Schema.String.pipe(Schema.check(Schema.isUUID()))        // there is no Schema.UUID constant
Schema.Array(S).pipe(Schema.check(Schema.isUnique(), Schema.isMaxLength(10)))
// custom
S.check(Schema.makeFilter((v) => v.a <= v.b ? undefined : { path: ["a"], issue: "a must be <= b" }, { message: "..." }))
Schema.refine((n: number): n is Positive => n > 0)     // narrows the TS type
S.annotate({ title, description, examples, message, identifier })
```

Filter constructors: `isTrimmed, isPattern, isStartsWith, isEndsWith, isIncludes,
isUppercased, isLowercased, isUUID, isULID, isBase64, isFinite, isInt, isInt32,
isGreaterThan(OrEqualTo), isLessThan(OrEqualTo), isBetween, isMultipleOf,
isMinLength, isMaxLength, isLengthBetween, isNonEmpty, isMinSize, isMaxSize,
isUnique, isMinProperties, isPropertyNames, is*Date, is*BigInt`. `Schema.filter`,
`Schema.int()`, `Schema.positive()` do not exist.

## Transformations

`Schema.transform` does not exist. Pair a target schema with a transformation:

```ts
import { Schema, SchemaGetter, SchemaTransformation } from "effect"

const Cents = Schema.Number.pipe(Schema.decodeTo(Schema.Int, SchemaTransformation.transform({ decode: (d) => Math.round(d * 100), encode: (c) => c / 100 })))
const Csv = Schema.String.pipe(Schema.decodeTo(Schema.Array(Schema.String), SchemaTransformation.make({
  decode: SchemaGetter.trim<string>().compose(SchemaGetter.split<string>({ separator: "," })),
  encode: SchemaGetter.transform((arr: ReadonlyArray<string>) => arr.join(","))
})))
const Parsed = Schema.String.pipe(Schema.decodeTo(Schema.Date, SchemaTransformation.transformEffect({
  decode: (s, options) => { const d = new Date(s); return isNaN(d.getTime()) ? Effect.fail(new SchemaIssue.InvalidValue({ message: "bad date" }, s, options)) : Effect.succeed(d) },
  encode: (d) => Effect.succeed(d.toISOString())
})))
Schema.String.pipe(Schema.decodeTo(Schema.Number, SchemaTransformation.numberFromString))
Schema.String.pipe(Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromJsonString()))
S.pipe(Schema.decode({ decode: SchemaGetter.transform((s) => s.trim()), encode: SchemaGetter.passthrough() }))   // same-type
Schema.Struct({ n: Schema.Natural.pipe(Schema.withDecodingDefault(Effect.succeed(10))) })                        // default on decode
Schema.optionalKey(S).pipe(Schema.decodeTo(S, { decode: SchemaGetter.withDefault(Effect.succeed(d)), encode: SchemaGetter.passthrough() }))
```

`SchemaGetter` legs: `transform`, `transformEffect`, `transformOptional`,
`withDefault`, `required`, `onNone`, `onSome`, `String()`, `Number()`, `trim`,
`split`, `parseJson`, `stringifyJson`, `snakeToCamel`, `decodeBase64`, `encodeHex`...
`SchemaTransformation` presets: `trim`, `toLowerCase`, `numberFromString`,
`dateFromString`, `fromJsonString`, `optionFromNullOr`, `urlFromString`,
`durationFromMillis`, `uint8ArrayFromBase64String`, `passthrough`.
Transformations can require services (`RD`/`RE`): they surface in
`DecodingServices` and must be provided when decoding.

## Decoding and encoding

```ts
Schema.decodeUnknownEffect(S)(input)   // Effect<Type, SchemaError, DecodingServices>   (preferred in Effect code)
Schema.decodeUnknownSync(S)(input)     // throws SchemaError; only at non-Effect edges
Schema.decodeUnknownResult(S)(input)   // Result<Type, SchemaError>
Schema.decodeUnknownOption(S)(input); Schema.decodeUnknownExit(S)(input); Schema.decodeUnknownPromise(S)(input)
Schema.decodeEffect(S)(encoded)        // input already typed as Encoded
Schema.encodeEffect(S)(value) / encodeSync / encodeUnknownEffect / encodeResult ...
Schema.is(S)(u)                        // type guard
Schema.asserts(S, u)                   // asserts u is Type; throws Error with .cause = Issue
// parse options: { errors: "all" | "first", onExcessProperty: "ignore" | "error" | "preserve", reportInput: true }
```

`SchemaError` is a `TaggedError` (`_tag: "SchemaError"`, `.issue`, `.message`).
Format issues with `SchemaIssue.makeFormatterDefault()(error.issue)` or
`makeFormatterStandardSchemaV1()` for `{ issues: [{ message, path }] }`.
Map it to a domain error at the boundary:
`Effect.mapError((e) => new InvalidPayload({ message: e.message }))`.

Derived tools: `Schema.toJsonSchemaDocument(S, { additionalProperties, generateDescriptions })`
(no `toJsonSchema`), `JsonSchema.toDocumentDraft07(doc)`, `Schema.toStandardSchemaV1(S)`,
`Schema.toEquivalence(S)`, `Arbitrary.schema(S)` from `effect/unstable/arbitrary/Arbitrary`, `Schema.toFormatter(S)`,
`Schema.toType(S)` / `Schema.toEncoded(S)` (drop transformations), `Schema.revealCodec(S)`.

## Errors

```ts
class NotFound extends Schema.TaggedError<NotFound>()("NotFound", { id: UserId }, { httpApiStatus: 404 }) {}
class Timeout extends Schema.Error<Timeout>("Timeout")({ after: Schema.Number }) {}      // untagged, yieldable
class StoreError extends Schema.TaggedError<StoreError>()("StoreError", { reason: Schema.Union([NotFound, Timeout]), cause: Schema.optionalKey(Schema.Defect()) }) {}
return yield* new NotFound({ id })     // yieldable; message auto-derived; JSON codec for RPC/HTTP
```

`Schema.TaggedError` is useful for domain errors that need codecs. `Data.TaggedError("Tag")<Fields>`
when no codec is wanted. Reason-nesting keeps service signatures to one error
type while `Effect.catchReason(s)` / `unwrapReason` reach the specifics.

## State and event unions

```ts
const State = Schema.TaggedUnion({
  Idle: {},
  Running: { jobId: Schema.String, startedAt: Schema.Number },
  Done: { jobId: Schema.String, output: Schema.String }
})
type State = typeof State.Type
State.cases.Running.make({ jobId, startedAt })
State.match(state, { Idle: () => ..., Running: (s) => ..., Done: (s) => ... })        // exhaustive
State.matchOrElse(state, { Done: (s) => ... }, (other) => ...)
State.guards.Running(u); State.isAnyOf(["Running", "Done"])(state)
// or: Schema.Union([Schema.TaggedStruct("A", {...}), Schema.TaggedStruct("B", {...})]).pipe(Schema.toTaggedUnion("_tag"))
```

Events and states defined this way decode from JSON, validate on construction,
and match exhaustively, which is the foundation of the state-machine pattern.

## Database models

`Model.Class` from `effect/unstable/schema` derives `select` (default),
`insert`, `update`, `json`, `jsonCreate`, `jsonUpdate` variants from one field
list: `Model.GeneratedByDb(S)`, `Model.GeneratedByApp(S)`, `Model.UuidV4Insert(Id)`,
`Model.Sensitive(S)`, `Model.DateTimeInsert`, `Model.DateTimeUpdate`,
`Model.JsonFromString(S)`, `Model.BooleanSqlite`, `Model.FieldOnly([...])`,
`Model.FieldExcept([...])`, `Model.Field({ select, json })`. Use `User.json` in
HTTP responses, `User.jsonCreate` as POST payload, `User.insert.makeEffect(input)`
to fill generated ids and timestamps from the Clock. See data-and-workflows.

## Testing schemas

```ts
const asserts = new TestSchema.Asserts(User)
await asserts.decoding().succeed(json, expected); await asserts.decoding().fail(bad, "Expected string")
await asserts.encoding().succeed(value, encoded); await asserts.verifyLosslessTransformation()
```

## JSON, derivation and correctness

`Schema.BigInt` and `Schema.Uint8Array` describe in-memory values, not JSON-safe
wire representations. Use an explicit string/base64 codec or `Schema.toCodecJson`
when producing a JSON-compatible representation. Encode with the chosen codec,
then test JSON stringify/parse and decode. Schema.Defect preserves useful failure
information but neither redacts secrets nor losslessly reconstructs every thrown
JavaScript object. Do not expose it directly as a public HTTP error.

Schema supports effectful decode/encode with independent requirements, optional
keys/defaults, recursion, brands/refinements, transformations, tagged unions,
class extension, annotations and format/issue customization. Derived tools
include JsonSchema documents, Standard Schema interoperability, arbitrary
generation, formatting and equivalence. Advanced SchemaAST, SchemaParser,
SchemaGetter, SchemaTransformation and SchemaRepresentation APIs are for custom
codec/tooling implementations; search the inventory before recreating them.

Defaults and transforms can alter behavior: trimming, case-folding, accepting
numeric strings, excess-property stripping and absent-vs-undefined semantics must
be deliberate in migration. A codec need not be lossless (normalization/rounding
may be intended); test its specified laws rather than demanding identity for a
lossy transform. `new Class`/`.make` can throw; decode untrusted data effectfully.
