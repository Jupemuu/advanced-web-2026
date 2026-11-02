// A union of string literal types: a TaskStatus can only ever be one of these
// three exact strings. Assigning "finished" is a compile-time error.
export type TaskStatus = "open" | "in progress" | "done";

// An interface describes the shape of an object.
// - `readonly` means the property cannot be reassigned after creation.
// - `status` uses the custom TaskStatus type defined above.
export interface Task {
  readonly id: number;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate?: string;
}
