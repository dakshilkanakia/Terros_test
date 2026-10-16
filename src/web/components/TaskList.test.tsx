// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskView } from "../../shared/types";
import { TaskList } from "./TaskList";

const task: TaskView = {
  id: "task-1",
  title: "Confirm install date",
  customerName: "Patel residence",
  status: "open",
  dueAt: "2026-03-09T15:00:00.000Z",
  completedAt: null,
  isOverdue: true,
  assignee: { id: "u-marcus", name: "Marcus Bell" },
  team: { id: "team-north", name: "North Metro" },
};

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("TaskList", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a loading message and then the tasks", async () => {
    mockFetch({ tasks: [task] });

    render(<TaskList view="overdue" />);

    expect(screen.getByRole("status")).toHaveProperty("textContent", "Loading tasks…");
    expect(await screen.findByText("Confirm install date")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
  });

  it("requests the overdue endpoint with the selected rep", async () => {
    const fetchMock = mockFetch({ tasks: [task] });

    render(<TaskList view="overdue" repId="u-marcus" />);

    await screen.findByText("Confirm install date");
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/overdue?repId=u-marcus", expect.anything());
  });

  it("tells the user when there is nothing overdue", async () => {
    mockFetch({ tasks: [] });

    render(<TaskList view="overdue" />);

    expect(await screen.findByText("No overdue tasks. Everyone is caught up.")).toBeTruthy();
  });

  it("shows an error with a retry instead of the empty message when the request fails", async () => {
    const fetchMock = mockFetch({ error: { code: "internal_error", message: "Something went wrong" } }, 500);

    render(<TaskList view="overdue" />);

    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong");
    expect(screen.queryByText("No overdue tasks. Everyone is caught up.")).toBeNull();

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ tasks: [task] }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Confirm install date")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("TaskList completing a task", () => {
  const other: TaskView = { ...task, id: "task-2", title: "Send revised proposal", isOverdue: false };
  const completed: TaskView = { ...task, status: "completed", completedAt: "2026-03-10T15:00:00.000Z", isOverdue: false };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  function deferred() {
    let resolve!: (response: Response) => void;
    const promise = new Promise<Response>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  /** GET responses are served in order; POST uses `onPost`. */
  function routedFetch(gets: Array<Response | Promise<Response>>, onPost: () => Response) {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "POST" ? onPost() : gets.shift()!),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const getCalls = (fetchMock: ReturnType<typeof routedFetch>) =>
    fetchMock.mock.calls.filter(([, init]) => init?.method !== "POST").length;

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the rows on screen while the list refreshes, then drops the completed task", async () => {
    const refresh = deferred();
    const fetchMock = routedFetch([json({ tasks: [task, other] }), refresh.promise], () => json({ task: completed }));
    render(<TaskList view="all" status="open" />);
    await screen.findByText(task.title);

    await userEvent.click(screen.getAllByRole("button", { name: "Mark complete" })[0]!);

    await waitFor(() => expect(getCalls(fetchMock)).toBe(2));
    expect(screen.queryByText("Loading tasks…")).toBeNull();
    expect(screen.getByText(task.title)).toBeTruthy();
    expect(screen.getByText(other.title)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveProperty("disabled", true);

    refresh.resolve(json({ tasks: [other] }));

    await waitFor(() => expect(screen.queryByText(task.title)).toBeNull());
    expect(screen.getByText(other.title)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Saving…" })).toBeNull();
  });

  it("keeps the old rows and shows a small error when the refresh fails, then recovers", async () => {
    const fetchMock = routedFetch(
      [json({ tasks: [task, other] }), json({ error: { code: "internal_error", message: "Boom" } }, 500)],
      () => json({ task: completed }),
    );
    render(<TaskList view="all" status="open" />);
    await screen.findByText(task.title);

    await userEvent.click(screen.getAllByRole("button", { name: "Mark complete" })[0]!);

    expect((await screen.findByRole("alert")).textContent).toContain("Could not refresh");
    expect(screen.getByText(task.title)).toBeTruthy();
    expect(screen.getByText(other.title)).toBeTruthy();
    expect(screen.queryByText("We couldn't load tasks.", { exact: false })).toBeNull();

    fetchMock.mockImplementation(() => Promise.resolve(json({ tasks: [other] })));
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByText(task.title)).toBeNull();
    expect(screen.getByText(other.title)).toBeTruthy();
  });

  it("shows the failure and refreshes a stale row when the task was already completed", async () => {
    routedFetch([json({ tasks: [task, other] }), json({ tasks: [other] })], () =>
      json({ error: { code: "conflict", message: "Task task-1 is already completed" } }, 409),
    );
    render(<TaskList view="all" status="open" />);
    await screen.findByText(task.title);

    await userEvent.click(screen.getAllByRole("button", { name: "Mark complete" })[0]!);

    expect((await screen.findByRole("alert")).textContent).toContain("already completed");
    await waitFor(() => expect(screen.queryByText(task.title)).toBeNull());
    expect(screen.getByText(other.title)).toBeTruthy();
  });

  it("still shows the failure when the refreshed list is empty", async () => {
    routedFetch([json({ tasks: [task] }), json({ tasks: [] })], () =>
      json({ error: { code: "not_found", message: "Task task-1 was not found" } }, 404),
    );
    render(<TaskList view="all" status="open" />);
    await screen.findByText(task.title);

    await userEvent.click(screen.getByRole("button", { name: "Mark complete" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Could not complete");
    expect(screen.getByText("No tasks match these filters.")).toBeTruthy();
  });

  it("still shows the loading message when the filters change", async () => {
    const next = deferred();
    routedFetch([json({ tasks: [task] }), next.promise], () => json({ task: completed }));
    const { rerender } = render(<TaskList view="all" status="open" />);
    await screen.findByText(task.title);

    rerender(<TaskList view="all" status="open" repId="u-alicia" />);

    expect(screen.getByRole("status").textContent).toBe("Loading tasks…");
    expect(screen.queryByText(task.title)).toBeNull();
  });
});
