import { useEffect, useState } from "react";

type ProjectRow = {
  id: string;
  name: string;
  clientCompany: string;
  startDate: string;
  completedDate: string;
  status: string;
};

type TaskRow = {
  id: string;
  title: string;
  assignee: string;
  startDate: string;
  dueDate: string;
};

type MilestoneRow = {
  id: string;
  title: string;
  project: string;
  targetDate: string;
};

type ProjectExpenseRow = {
  id: string;
  title: string;
  category: string;
  amount: string;
  date: string;
  payee: string;
  notes: string;
};

type ProjectDetailRow = {
  projectId: string;
  projectValueEnabled: boolean;
  projectValue: string;
  teams: string[];
  employees: string[];
  expenses: ProjectExpenseRow[];
  notes: string;
  updatedAt: string;
};

type ProjectTeamRow = {
  id: string;
  name: string;
  members: string[];
  departments: string[];
};

type ProjectsWorkspace = {
  projects: ProjectRow[];
  tasks: TaskRow[];
  milestones: MilestoneRow[];
  projectTeams: ProjectTeamRow[];
  projectDetails: Record<string, ProjectDetailRow>;
};

const STORAGE_KEY = "wz_business_autopilot_projects_module";

const DEFAULT_PROJECTS_WORKSPACE: ProjectsWorkspace = {
  projects: [
    { id: "p1", name: "ERP Rollout", clientCompany: "Ultra HD Prints", startDate: "", completedDate: "", status: "Ongoing" },
    { id: "p2", name: "HR Automation", clientCompany: "North India Jewels", startDate: "", completedDate: "", status: "New" }
  ],
  tasks: [
    { id: "t1", title: "Finalize sprint board", assignee: "Guru", startDate: "2026-02-16", dueDate: "2026-02-20" },
    { id: "t2", title: "Client approval review", assignee: "Arun", startDate: "2026-02-18", dueDate: "2026-02-22" }
  ],
  milestones: [
    { id: "m1", title: "Phase 1 Go-Live", project: "ERP Rollout", targetDate: "2026-03-10" },
    { id: "m2", title: "Payroll Cutover", project: "HR Automation", targetDate: "2026-03-25" }
  ],
  projectTeams: [
    { id: "team_1", name: "Implementation Team", members: ["Guru", "Nithya"], departments: ["Engineering", "HR"] },
    { id: "team_2", name: "Support Team", members: ["Arun"], departments: ["Operations"] }
  ],
  projectDetails: {
    p1: {
      projectId: "p1",
      projectValueEnabled: true,
      projectValue: "450000",
      teams: ["Implementation Team", "Support Team"],
      employees: ["Guru", "Nithya"],
      expenses: [
        { id: "pex_1", title: "Requirement workshop", category: "Travel", amount: "18000", date: "2026-02-19", payee: "Field Team", notes: "Client kickoff travel and stay" },
        { id: "pex_2", title: "Server provisioning", category: "Infrastructure", amount: "42000", date: "2026-02-24", payee: "Cloud Vendor", notes: "Production hosting setup" }
      ],
      notes: "Priority rollout project with phase-wise delivery tracking.",
      updatedAt: "2026-02-24T10:00:00.000Z"
    },
    p2: {
      projectId: "p2",
      projectValueEnabled: false,
      projectValue: "",
      teams: ["HR Operations"],
      employees: ["Guru"],
      expenses: [{ id: "pex_3", title: "Process discovery", category: "Consulting", amount: "12000", date: "2026-02-25", payee: "Internal Team", notes: "" }],
      notes: "Automation blueprint under approval.",
      updatedAt: "2026-02-25T09:30:00.000Z"
    }
  }
};

function readWorkspace() {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_PROJECTS_WORKSPACE;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PROJECTS_WORKSPACE;
    }
    const parsed = JSON.parse(raw);
    return {
      projects: Array.isArray(parsed?.projects) ? parsed.projects : DEFAULT_PROJECTS_WORKSPACE.projects,
      tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : DEFAULT_PROJECTS_WORKSPACE.tasks,
      milestones: Array.isArray(parsed?.milestones) ? parsed.milestones : DEFAULT_PROJECTS_WORKSPACE.milestones,
      projectTeams: Array.isArray(parsed?.projectTeams) ? parsed.projectTeams : DEFAULT_PROJECTS_WORKSPACE.projectTeams,
      projectDetails: parsed?.projectDetails && typeof parsed.projectDetails === "object" ? parsed.projectDetails : DEFAULT_PROJECTS_WORKSPACE.projectDetails
    } satisfies ProjectsWorkspace;
  } catch {
    return DEFAULT_PROJECTS_WORKSPACE;
  }
}

export function useBusinessAutopilotProjects(enabled: boolean) {
  const [state, setState] = useState<{ data: ProjectsWorkspace | null; loading: boolean; error: string }>({
    data: enabled ? readWorkspace() : null,
    loading: false,
    error: ""
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: "" });
      return;
    }

    const sync = () => {
      setState({ data: readWorkspace(), loading: false, error: "" });
    };

    sync();
    if (typeof window !== "undefined") {
      window.addEventListener("storage", sync);
      window.addEventListener("focus", sync);
      return () => {
        window.removeEventListener("storage", sync);
        window.removeEventListener("focus", sync);
      };
    }
  }, [enabled]);

  return state;
}
