export class RubricError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RubricError";
  }
}
