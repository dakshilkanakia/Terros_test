import type { RequestContext } from "../../auth/requestContext";
import type { Task, TaskQuery, TaskRepository } from "../../repository/types";
import type { Clock } from "../clock";
import { normalizeFilters } from "./filters";
import type { TaskQueryRegistry } from "./registry";
import type { TaskScopeResolver } from "./scope";
import type { TaskQueryDefinition, TaskQueryEnvironment, TaskQueryFilters, TaskQueryName, TaskQueryPlan } from "./types";

export class TaskQueryEngine {
  constructor(
    private readonly registry: TaskQueryRegistry,
    private readonly scope: TaskScopeResolver,
    private readonly tasks: TaskRepository,
    private readonly clock: Clock,
  ) {}

  async run(name: TaskQueryName, context: RequestContext, filters: TaskQueryFilters = {}): Promise<Task[]> {
    const definition = this.registry.get(name);
    const env: TaskQueryEnvironment = {
      now: this.clock.now(),
      context,
      filters: normalizeFilters(definition, filters),
    };
    const plan = await this.plan(definition, env, filters);
    const tasks = await this.tasks.findTasks(plan.repositoryQuery);
    return tasks.filter((task) => plan.predicates.every((criterion) => criterion.test!(task, env))).sort(definition.order);
  }

  /**
   * `requested` is what the caller asked for, before `accepts` filtering. Scope
   * reads it directly so a rep filter is always checked against what the user may see.
   */
  async plan(
    definition: TaskQueryDefinition,
    env: TaskQueryEnvironment,
    requested: TaskQueryFilters = env.filters,
  ): Promise<TaskQueryPlan> {
    const narrowed = definition.criteria.reduce<TaskQuery>(
      (query, criterion) => (criterion.narrow ? criterion.narrow(query, env) : query),
      {},
    );
    // Scope is applied last so no criterion can widen what the user may see.
    const scoped = await this.scope.resolve(env.context, { repId: requested.repId?.trim() });
    return {
      definition,
      repositoryQuery: { ...narrowed, ...scoped },
      predicates: definition.criteria.filter((criterion) => criterion.test),
    };
  }
}
