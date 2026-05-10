// Netlify Function wrapper around the TanStack Start SSR handler.
// The Vite build emits dist/server/server.js which default-exports a
// fetch-style entry: { fetch(request, env, ctx): Response }.
import handler from "../../dist/server/server.js";

export default async (request, context) => {
  return handler.fetch(request, process.env, context);
};

export const config = {
  path: "/*",
  preferStatic: true,
};
