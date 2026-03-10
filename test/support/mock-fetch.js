const routes = JSON.parse(process.env.RRULENET_TEST_FETCH_ROUTES || "{}");

globalThis.fetch = async (input, init = {}) => {
  const method = (init.method || "GET").toUpperCase();
  const url = typeof input === "string" ? new URL(input) : new URL(input.url);
  const route = routes[`${method} ${url.pathname}`];

  if (!route) {
    throw new Error(`Unhandled fetch route: ${method} ${url.pathname}`);
  }

  if (route.throw) {
    throw new Error(route.throw);
  }

  return new Response(JSON.stringify(route.body), {
    status: route.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(route.headers || {}),
    },
  });
};
