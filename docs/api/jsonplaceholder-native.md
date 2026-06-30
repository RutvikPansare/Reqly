# jsonplaceholder

JSONPlaceholder starter collection - free fake REST API, no auth, no setup

## create-todo

**POST** `{{baseUrl}}/todos`

### Headers
| Key | Value |
|---|---|
| `Content-Type` | `application/json` |

### Request Body
```
{
  "title": "Learn Reqly",
  "completed": false,
  "userId": 1
}

```


## get-todo

**GET** `{{baseUrl}}/todos/1`


## get-user

**GET** `{{baseUrl}}/users/{{create-todo.response.body.userId}}`


## list-todos

**GET** `{{baseUrl}}/todos`

### Parameters
| Key | Value |
|---|---|
| `userId` | `{{userId}}` |
