import { describe, expect, it } from "vitest";

import { buildRequestContext } from "../../auth/requestContext";
import { createFixtureData } from "../../fixtures/data";
import { FixtureDirectoryRepository, FixtureTaskRepository } from "../../repository/fixtureRepository";
import { canAccessTask, TaskScopeResolver } from "./scope";

describe("canAccessTask", () => {
  it("matches exactly the tasks the scope resolver lets each user list", async () => {
    const data = createFixtureData(new Date("2026-03-10T15:00:00.000Z"));
    const directory = new FixtureDirectoryRepository(data);
    const tasks = new FixtureTaskRepository(data);
    const resolver = new TaskScopeResolver(directory);

    for (const user of data.users) {
      const context = await buildRequestContext(user, directory);
      const listed = new Set((await tasks.findTasks(await resolver.resolve(context, {}))).map((task) => task.id));

      for (const task of data.tasks) {
        expect(canAccessTask(context.scope, task), `${user.id} / ${task.id}`).toBe(listed.has(task.id));
      }
    }
  });
});
