/** The request has to wait for a connection (it goes to the offline queue when it can). */
export class DeferredError extends Error {
  readonly reason: string

  constructor(reason: string) {
    super("You're offline, so this has to wait for a connection.")
    this.name = 'DeferredError'
    this.reason = reason
  }
}

/** The model answered, but its output could not be used. Worth one more try. */
export class BadOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadOutputError'
  }
}
