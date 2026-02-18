# Farming API

Simple Node/Express REST API with user management, authentication (JWT), and group-based authorization.

Basic endpoints:
- POST `/auth/register` {username,password,groups?}
- POST `/auth/login` {username,password}
- GET `/users` (authenticated)
- GET `/users/:id` (authenticated)
- PUT `/users/:id` (self or admin group)
- GET `/groups` (authenticated)
- POST `/groups` {name,description}
- POST `/groups/:name/users` {userId}

Run:

```powershell
cd f:\Web\farming
npm install
npm start
```
# farming
