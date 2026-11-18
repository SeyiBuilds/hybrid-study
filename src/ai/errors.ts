/** The model answered, but its output could not be used. Worth one more try. */
export class BadOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadOutputError'
  }
}
