import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app";
import { fixedClock } from "../domain/clock";
import { createFixtureData } from "../fixtures/data";

const referenceTime = new Date("2026-03-10T15:00:00.000Z");

function setup() {
  return createApp({ clock: fixedClock(referenceTime), data: createFixtureData(referenceTime) });
}

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const ids = (body: { tasks: { id: string }[] }) => body.tasks.map((task) => task.id);

describe("GET /api/tasks/overdue", () => {
  it("lists a manager's overdue team work, earliest first", async () => {
    const res = await request(setup()).get("/api/tasks/overdue").set(as("demo-dana"));

    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(["task-1007", "task-1001", "task-1004"]);
  });

  it("narrows to one rep when repId is given", async () => {
    const res = await request(setup()).get("/api/tasks/overdue?repId=u-alicia").set(as("demo-dana"));

    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(["task-1004"]);
  });

  it("returns 403 for a rep outside the manager's teams", async () => {
    const res = await request(setup()).get("/api/tasks/overdue?repId=u-sam").set(as("demo-dana"));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("returns 403 when a rep asks for someone else's tasks", async () => {
    const res = await request(setup()).get("/api/tasks/overdue?repId=u-alicia").set(as("demo-marcus"));

    expect(res.status).toBe(403);
  });
});

describe("POST /api/tasks/:taskId/complete", () => {
  it("lets a rep complete their own task", async () => {
    const res = await request(setup()).post("/api/tasks/task-1001/complete").set(as("demo-marcus"));

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe("completed");
  });

  it("reports a teammate's task as not found to a rep", async () => {
    const app = setup();

    const res = await request(app).post("/api/tasks/task-1004/complete").set(as("demo-marcus"));

    expect(res.status).toBe(404);
    const check = await request(app).get("/api/tasks?status=open").set(as("demo-dana"));
    expect(ids(check.body)).toContain("task-1004");
  });

  it("reports another team's task as not found to a rep", async () => {
    const res = await request(setup()).post("/api/tasks/task-2001/complete").set(as("demo-marcus"));

    expect(res.status).toBe(404);
  });

  it("lets a manager complete a task on their team but not another team's", async () => {
    const app = setup();

    expect((await request(app).post("/api/tasks/task-1004/complete").set(as("demo-dana"))).status).toBe(200);
    expect((await request(app).post("/api/tasks/task-2001/complete").set(as("demo-dana"))).status).toBe(404);
  });

  it("returns 409 when the task is already completed", async () => {
    const res = await request(setup()).post("/api/tasks/task-1002/complete").set(as("demo-marcus"));

    expect(res.status).toBe(409);
  });
});

describe("authentication", () => {
  it("returns 401 without a valid token", async () => {
    const app = setup();

    expect((await request(app).get("/api/tasks")).status).toBe(401);
    expect((await request(app).get("/api/tasks").set(as("nope"))).status).toBe(401);
  });
});
