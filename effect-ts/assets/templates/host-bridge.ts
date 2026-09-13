// Foreign host owns this adapter and must call dispose at teardown.
import * as Effect from "effect/Effect"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { getUser, layerMemory, type User } from "./library.js"

export const makeClient = (users: ReadonlyArray<User>) => {
  const runtime = ManagedRuntime.make(layerMemory(users))
  return {
    getUser: (id: string, signal?: AbortSignal) =>
      runtime.runPromise(getUser(id), signal === undefined ? undefined : { signal }),
    // Full Exit is available when a caller needs structured termination evidence.
    getUserExit: (id: string) => runtime.runPromise(Effect.exit(getUser(id))),
    dispose: () => runtime.dispose()
  }
}
