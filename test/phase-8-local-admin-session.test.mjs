import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalAdminSessionManager,
  parseLocalAdminCookie
} from "../dist/auth/localAdminSession.js";

test("local admin bootstrap is fragment-only and one-use", () => {
  let now = 1_000;
  const sessions = new LocalAdminSessionManager({ now: () => now });
  const bootstrap = sessions.issueBootstrap({ origin: "http://127.0.0.1:8788" });

  assert.match(bootstrap.url, /^http:\/\/127\.0\.0\.1:8788\/#bootstrap=[A-Za-z0-9_-]{43}$/);
  assert.equal(bootstrap.url.includes("?"), false);

  const wrongOrigin = sessions.issueBootstrap({ origin: "http://127.0.0.1:8788" });
  assert.throws(
    () => sessions.exchangeBootstrap(wrongOrigin.token, "http://127.0.0.1:8789"),
    /AUTH_ADMIN_BOOTSTRAP_INVALID/
  );

  const exchanged = sessions.exchangeBootstrap(bootstrap.token, "http://127.0.0.1:8788");
  assert.match(exchanged.cookieValue, /^[A-Za-z0-9_-]{43}$/);
  assert.match(exchanged.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  assert.throws(() => sessions.exchangeBootstrap(bootstrap.token, "http://127.0.0.1:8788"), /AUTH_ADMIN_BOOTSTRAP_INVALID/);

  const validated = sessions.validateSession(exchanged.cookieValue);
  assert.equal(validated.csrfToken, exchanged.csrfToken);
  sessions.assertCsrf(exchanged.cookieValue, exchanged.csrfToken);
  assert.throws(() => sessions.assertCsrf(exchanged.cookieValue, "x".repeat(43)), /AUTH_ADMIN_CSRF_INVALID/);

  now += 16 * 60 * 1000;
  assert.throws(() => sessions.validateSession(exchanged.cookieValue), /AUTH_ADMIN_SESSION_EXPIRED/);
});

test("local admin sessions are bounded and absolute expiry wins", () => {
  let now = 10_000;
  const sessions = new LocalAdminSessionManager({ now: () => now, maxSessions: 4 });
  const active = [];
  for (let index = 0; index < 4; index += 1) {
    const bootstrap = sessions.issueBootstrap({ origin: "http://127.0.0.1:8788" });
    active.push(sessions.exchangeBootstrap(bootstrap.token, "http://127.0.0.1:8788"));
  }
  const overflow = sessions.issueBootstrap({ origin: "http://127.0.0.1:8788" });
  assert.throws(
    () => sessions.exchangeBootstrap(overflow.token, "http://127.0.0.1:8788"),
    /AUTH_ADMIN_SESSION_CAPACITY/
  );

  sessions.revoke(active[0].cookieValue);
  const recovered = sessions.exchangeBootstrap(overflow.token, "http://127.0.0.1:8788");
  assert.match(recovered.cookieValue, /^[A-Za-z0-9_-]{43}$/);

  now += 8 * 60 * 60 * 1000 + 1;
  assert.throws(() => sessions.validateSession(active[1].cookieValue), /AUTH_ADMIN_SESSION_EXPIRED/);
});

test("local admin cookie parsing rejects duplicate session cookies", () => {
  assert.equal(parseLocalAdminCookie("other=1; codexgpt_admin=abc"), "abc");
  assert.equal(parseLocalAdminCookie("codexgpt_admin=abc; codexgpt_admin=def"), "");
  assert.equal(parseLocalAdminCookie("codexgpt_admin=; codexgpt_admin=abc"), "");
});
