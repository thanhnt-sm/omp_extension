import { expect, test } from "bun:test";
import { AdvisorHostFixture, object } from "./advisor-host-fixture";

test.each([
  { spawnKey: "allocated-session-child", expectedReviews: 1, expectedProviderCalls: 1 },
  { spawnKey: "foreign-child", expectedReviews: 0, expectedProviderCalls: 0 },
])("native allocated spawn identity $spawnKey is joined to the actual child", async ({ spawnKey, expectedReviews, expectedProviderCalls }) => {
  const host = new AdvisorHostFixture();
  await host.start();
  const emit = host.emit.bind(host);
  host.emit = async (name, event, context) => emit(name,
    name === "before_subagent_spawn" ? { ...object(event), spawnKey } : event,
    context ?? host.context);
  const prepared = await host.prepare();
  const result = await host.nativeReview(object(prepared.parameters));
  host.persistNativeResult(result);
  expect(host.providerCalls).toBe(expectedProviderCalls);
  expect((await host.registration.reviews(host.context)).length).toBe(expectedReviews);
});
