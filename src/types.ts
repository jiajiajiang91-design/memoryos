export type SourceTool = "ChatGPT" | "Claude" | "Cursor" | "Gemini";
export type RiskLevel = "low" | "medium" | "high";

export type ProjectMeta = {
  slug: string;
  name: string;
  description: string;
  currentGoal: string;
  currentGoalBullets: string[];
  focus: string;
  progress: number;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  filename: string;
  date: string;
  time: string;
  sourceTool: SourceTool;
  sessionGoal: string;
  rawMarkdown: string;
};

export type Project = ProjectMeta & {
  contextMarkdown: string;
  decisionsMarkdown: string;
  sessions: Session[];
};

export type ParsedHandoff = {
  metadata: Record<string, string>;
  whatWeWorkedOn: string;
  keyDecisions: string;
  currentState: string;
  openQuestions: string;
  nextActions: string;
  suggestedContextUpdate: string;
  suggestedDecisionsUpdate: string;
  suggestedAboutMeUpdate: string;
  compactContext: string;
};

export type UpdateSuggestion = {
  id: string;
  targetFile: string; // "session" for the low-risk save, else file name
  riskLevel: RiskLevel;
  content: string;
  selected: boolean;
  warning?: string;
};
