import type { Request, Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app";
import { fixedClock } from "../domain/clock";
import { createFixtureData } from "../fixtures/data";
import { errorHandler } from "./errors";

const referenceTime = new Date("2026-03-10T15:00:00.000Z");
const app = () => createApp({ clock: fixedClock(referenceTime), data: createFixtureData(referenceTime) });
const auth = { Authorization: "Bearer demo-marcus" };

describe("error handling", () => {
  it("returns 400 invalid_request for a malformed JSON body", async () => {
    const res = await request(app())
      .post("/api/tasks/task-1001/complete")
      .set(auth)
      .set("Content-Type", "application/json")
      .send('{"note": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
    expect(typeof res.body.error.message).toBe("string");
  });

  it("returns 413 in the standard error shape for an oversized body", async () => {
    const res = await request(app())
      .post("/api/tasks/task-1001/complete")
      .set(auth)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ note: "x".repeat(200_000) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("does not log client errors as server failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await request(app()).post("/api/tasks/task-1001/complete").set(auth).set("Content-Type", "application/json").send("{");

    expect(log).not.toHaveBeenCalled();
  });

  it("still returns 500 internal_error for unexpected failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    errorHandler(new Error("kaboom"), {} as Request, { status } as unknown as Response, () => {});

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: { code: "internal_error", message: "Something went wrong" } });
    expect(log).toHaveBeenCalled();
  });
});
