import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("SaaS light styles cannot select global dashboard typography, tables or controls", () => {
  const css = readFileSync(
    new URL("../src/saasAdmin.css", import.meta.url),
    "utf8",
  );
  const headers = [...css.matchAll(/([^{}]+)\{/g)].map((match) =>
    match[1].trim(),
  );
  for (const header of headers) {
    if (header.startsWith("@")) continue;
    if (header === "body:has(> #root > :is(.sa-auth, .sa-app))") continue;
    assert.ok(
      !/(?:^|,)\s*(?:html|body|:root|\*|h[1-6]|p|a|table|thead|th|td|tr|button|input|select|textarea)(?:$|\s|[.:#\[])/.test(
        header,
      ),
      `Global SaaS selector: ${header}`,
    );
    assert.ok(
      header.includes(".sa-"),
      `SaaS selector has no own scope: ${header}`,
    );
  }
  assert.match(
    css,
    /:where\(\.sa-auth, \.sa-app, \.sa-overlay, \.sa-tenant-workspace\) th \{/,
  );
  assert.match(
    css,
    /:where\(\.sa-auth, \.sa-app, \.sa-overlay, \.sa-tenant-workspace\) h1 \{/,
  );
});
test("owner shell explicitly owns the isolated light theme", () => {
  const source = readFileSync(
    new URL("../src/SaasAdmin.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /className="sa-shell sa-app"/);
});
