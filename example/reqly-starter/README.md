# Reqly starter collection

Working example collection against [JSONPlaceholder](https://jsonplaceholder.typicode.com) - free, no auth, no setup. Run `reqly init` from your project root to copy this into your own `.reqly/` directory.

## What each request demonstrates

- **get-todo** - basic GET with a status assertion.
- **create-todo** - POST with a body, status assertion, and a `postScript` that extracts the new todo's `id` into `env.lastTodoId`.
- **get-user** - chains off `create-todo` via `{{create-todo.response.body.userId}}` in the URL.
- **list-todos** - GET with a query param variable (`{{userId}}` from the active environment).

## Flow

`starter-flow.yaml` runs `get-todo`, extracts its `id`, runs `create-todo`, then asserts the response status is `201`.

## Copying into your project

```bash
reqly init
```

This copies `collections/`, `flows/`, and `environments.yaml` into `.reqly/` in your current project, without overwriting any files you already have.
