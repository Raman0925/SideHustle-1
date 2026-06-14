export interface contextBudget {
  systemPrompt: number;
  toolDefinitions: number;
  retrievedDocuments: number;
  conversationHistory: number;
  userMessage:number;
  responseBudget:number;
}
export interface ValidationResult {
  valid: boolean;
  violations: Array<{
    component: string;
    used: number;
    limit: number;
    over: number;
  }>;
}

export interface BudgetMetrics {
  utilization: Record<string, number>; // % used per component
  totalUsed: number;
  totalBudget: number;
  overallUtilization: number;
}