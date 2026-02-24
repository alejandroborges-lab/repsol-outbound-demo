export type CallStatus = 'running' | 'completed' | 'failed' | 'canceled' | 'scheduled';

export type CallOutcome =
  | 'escalated'        // escalate_to_commercial called
  | 'qualified'        // record_qualified_lead called (phase 4 complete)
  | 'price_recorded'   // record_price_expectation but not escalated
  | 'callback'         // schedule_callback called
  | 'decision_maker'   // request_decision_maker_contact called
  | 'voicemail'        // report_voicemail called
  | 'closed'           // close_polite called
  | 'in_progress'      // still running
  | 'unknown';

export type NegotiationResult = 'aligned' | 'negotiable' | 'out_of_market';

export interface ParsedCall {
  id: string;
  phone: string;
  contactName?: string;
  companyName?: string;
  status: CallStatus;
  outcome: CallOutcome;
  phaseReached: number;
  duration?: number; // seconds
  timestamp: string;
  completedAt?: string;
  toolsCalled: string[];
  negotiationResult?: NegotiationResult;
  callbackDate?: string;
  callbackTime?: string;
  callbackNotes?: string;
  decisionMakerName?: string;
  purchaseType?: string;
  annualConsumption?: string;
  closeReason?: string;
  clientPrice?: string;
}

export interface DashboardStats {
  total: number;
  escalated: number;
  qualified: number;
  callbacks: number;
  voicemails: number;
  closed: number;
  inProgress: number;
  conversionRate: number;
  negotiation: {
    aligned: number;
    negotiable: number;
    outOfMarket: number;
  };
}
