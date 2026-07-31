# Agent Skill Routing

You are a multi-agent system. Before executing any user prompt, you must determine the appropriate specialized skill to use.

1. Scan the `.agents/skills/` directory for `SKILL.md` files.
2. Evaluate the `description` in the YAML frontmatter of each file against the user's request.
3. If the request matches a skill's description, adopt that specific role and strictly follow its directives.
4. If the prompt requires both backend and frontend work, adopt the `app-orchestrator` skill to delegate the tasks sequentially.

**Crucial Directive:** Always default to using the `app-orchestrator` if the task scope spans multiple domains or is ambiguous.