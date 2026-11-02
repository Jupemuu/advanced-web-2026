import { jsonResponse, type ApiResponse } from "./response";
import type { Task } from "./task";

// Explicit type annotations. TypeScript could infer both types from the values,
// but writing them out once helps when you are learning the syntax.
const APP_NAME: string = "Todo App";
const PORT: number = 8000;

// The "database" for this week is a plain array that lives in memory.
// It resets every time the server restarts.
const tasks: Task[] = [
  { id: 1, title: "Learn TypeScript", description: "Learn TypeScript basics", status: "in progress" },
  { id: 2, title: "Build a Todo App", description: "Build a simple todo app using Bun", status: "open", dueDate: "2026-11-02"},
];

// The request handler: it receives every HTTP request and must return a Response.
// The generic ApiResponse type makes sure each payload has the right shape.
export function handler(req: Request): Response {
  const url = new URL(req.url);
  const status = url.searchParams.get("status")
  if (req.method === "GET" && url.pathname === "/tasks") {
    /// if there is no status gives both tasks
    if(!status){
    const response: ApiResponse<Task[]> = {
      success: true,
      statusCode: 200,
      data: tasks,
    };
    return jsonResponse(response);
    }
    if(status != "open" && status != "in progress" && status != "done"){
      const response: ApiResponse<null> = {
      success: false,
      statusCode: 400,
      error: "Invalid status",
    };
    return jsonResponse(response)
    }
    const statusmatch = tasks.filter((task) => task.status === status)
      const response: ApiResponse<Task[]> = {
      success: true,
      statusCode: 200,
      data: statusmatch,
    };
    return jsonResponse(response);
    


  }
  const segments = url.pathname.split("/");
  if (req.method === "GET" && segments[1] === "tasks") {
    const id = Number(segments[2])
    if(Number.isInteger(id)){
      const task = tasks.find((task) => task.id === id) 
      if(task){
        const response: ApiResponse<Task> = {
        success: true,
        statusCode: 200,
        data: task,
    };
    return jsonResponse(response);
    //else statement if Tasks doesnt have a task with the id
  } else{
      const response: ApiResponse<null> = {
      success: false,
      statusCode: 404,
      error: "Task not found",
    };
    return jsonResponse(response);
  }
  // else statement if the id is not a number
    }else{
      const response: ApiResponse<null> = {
      success: false,
      statusCode: 400,
      error: "Invalid task id",
    };
    return jsonResponse(response);
  }
  
}
  const response: ApiResponse<null> = {
    success: false,
    statusCode: 404,
    error: "Not Found",
  };
  return jsonResponse(response);
}

// `import.meta.main` is true only when this file is the program being run
// (`bun src/main.ts`), not when another file imports it. That lets the tests
// import `handler` without starting a server on port 8000.
if (import.meta.main) {
  const server = Bun.serve({
    port: PORT,
    fetch: handler,
  });

  console.log(`${APP_NAME} running at ${server.url}`);
}
