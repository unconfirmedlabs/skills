// Portable library: no runtime is created or executed here.
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"

export class User extends Schema.Class<User>("example/User")({
  id: Schema.String,
  name: Schema.NonEmptyString
}) {}

export class UserNotFound extends Schema.TaggedError<UserNotFound>()(
  "example/UserNotFound", { id: Schema.String }
) {}

export class UserRepo extends Context.Service<UserRepo, {
  find(id: string): Effect.Effect<Option.Option<User>>
}>()("example/UserRepo") {}

export const getUser = Effect.fn("example.getUser")(function*(
  id: string
): Effect.fn.Return<User, UserNotFound, UserRepo> {
  const repo = yield* UserRepo
  const user = yield* repo.find(id)
  if (Option.isNone(user)) return yield* new UserNotFound({ id })
  return user.value
})

// A read-only example fake; put test adapters in a /testing subpath in a package.
export const layerMemory = (users: ReadonlyArray<User>) => Layer.effect(
  UserRepo,
  Effect.gen(function*() {
    const state = yield* Ref.make(new Map(users.map(user => [user.id, user])))
    return UserRepo.of({
      find: (id) => Ref.get(state).pipe(Effect.map(map => Option.fromNullishOr(map.get(id))))
    })
  })
)
