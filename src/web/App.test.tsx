// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const accounts = [
  { token: "demo-dana", name: "Dana Whitfield", role: "manager", teamName: "North Metro" },
  { token: "demo-marcus", name: "Marcus Bell", role: "rep", teamName: "North Metro" },
];

const me: Record<string, unknown> = {
  "demo-dana": {
    user: { id: "u-dana", name: "Dana Whitfield", role: "manager" },
    teams: [{ id: "team-north", name: "North Metro" }],
  },
  "demo-marcus": {
    user: { id: "u-marcus", name: "Marcus Bell", role: "rep" },
    teams: [{ id: "team-north", name: "North Metro" }],
  },
};

const reps = [
  { id: "u-alicia", name: "Alicia Chen", teamId: "team-north" },
  { id: "u-jordan", name: "Jordan Pike", teamId: "team-north" },
];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

/** Answers each API route; task lists are empty because these tests only look at the requests. */
function mockApi() {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? "";
    const path = url.split("?")[0];
    switch (path) {
      case "/api/demo-accounts":
        return Promise.resolve(json({ accounts }));
      case "/api/me":
        return Promise.resolve(json(me[token]));
      case "/api/team/reps":
        return Promise.resolve(json({ reps }));
      default:
        return Promise.resolve(json({ tasks: [] }));
    }
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const requested = (fetchMock: ReturnType<typeof mockApi>) => fetchMock.mock.calls.map(([url]) => url);
const lastTaskRequest = (fetchMock: ReturnType<typeof mockApi>) =>
  requested(fetchMock)
    .filter((url) => url.startsWith("/api/tasks"))
    .at(-1);

describe("App rep filter", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  async function signedInAsManager() {
    const fetchMock = mockApi();
    render(<App />);
    await screen.findByRole("heading", { name: "North Metro follow-ups" });
    return fetchMock;
  }

  it("asks for the selected rep's overdue tasks on the Overdue tab", async () => {
    const fetchMock = await signedInAsManager();
    await userEvent.click(screen.getByRole("button", { name: "Overdue" }));

    await userEvent.selectOptions(await screen.findByLabelText("Rep"), "u-alicia");

    await waitFor(() => expect(lastTaskRequest(fetchMock)).toBe("/api/tasks/overdue?repId=u-alicia"));
  });

  it("keeps the selected rep when switching between tabs", async () => {
    const fetchMock = await signedInAsManager();
    await userEvent.selectOptions(await screen.findByLabelText("Rep"), "u-alicia");
    await waitFor(() => expect(lastTaskRequest(fetchMock)).toBe("/api/tasks?repId=u-alicia&status=open"));

    await userEvent.click(screen.getByRole("button", { name: "Overdue" }));

    await waitFor(() => expect(lastTaskRequest(fetchMock)).toBe("/api/tasks/overdue?repId=u-alicia"));
  });

  it("does not offer a rep filter to a rep", async () => {
    window.localStorage.setItem("field-operations.session", "demo-marcus");
    const fetchMock = mockApi();
    render(<App />);
    await screen.findByRole("heading", { name: "My follow-ups" });
    await waitFor(() => expect(lastTaskRequest(fetchMock)).toBeDefined());

    expect(screen.queryByLabelText("Rep")).toBeNull();
    expect(requested(fetchMock).some((url) => url.includes("repId"))).toBe(false);
    expect(requested(fetchMock)).not.toContain("/api/team/reps");
  });

  it("resets the rep filter when the account changes", async () => {
    const fetchMock = await signedInAsManager();
    await userEvent.selectOptions(await screen.findByLabelText("Rep"), "u-alicia");

    await userEvent.selectOptions(screen.getByLabelText("Signed in as"), "demo-marcus");
    await screen.findByRole("heading", { name: "My follow-ups" });

    expect(screen.queryByLabelText("Rep")).toBeNull();
    expect(lastTaskRequest(fetchMock)).toBe("/api/tasks?status=open");

    await userEvent.selectOptions(screen.getByLabelText("Signed in as"), "demo-dana");

    expect(((await screen.findByLabelText("Rep")) as HTMLSelectElement).value).toBe("");
    await waitFor(() => expect(lastTaskRequest(fetchMock)).toBe("/api/tasks?status=open"));
  });
});
