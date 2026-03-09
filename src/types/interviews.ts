/**
 * Interview management and prep types.
 */

export const INTERVIEW_TYPES = ['phone', 'video', 'onsite', 'technical', 'behavioral', 'case_study'] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_OUTCOMES = ['passed', 'rejected', 'pending', 'cancelled'] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const MOCK_SESSION_TYPES = ['behavioral', 'technical', 'case_study', 'mixed'] as const;
export type MockSessionType = (typeof MOCK_SESSION_TYPES)[number];

export interface STARMethod {
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
}

export interface InterviewJob {
  id: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  url?: string | null;
}

export interface Interview {
  id: string;
  application_id: string | null;
  candidate_id: string;
  job_id: string;
  interview_type: InterviewType | string | null;
  scheduled_at: string;
  duration_minutes: number;
  timezone: string | null;
  virtual_meeting_link: string | null;
  location: string | null;
  interviewer_name: string | null;
  interviewer_title: string | null;
  interviewer_email: string | null;
  interviewer_linkedin: string | null;
  preparation_notes: string | null;
  post_interview_notes: string | null;
  self_assessment_score: number | null;
  outcome: InterviewOutcome | string | null;
  thank_you_sent: boolean;
  created_at: string;
  updated_at: string;
  job?: InterviewJob | InterviewJob[] | null;
  application?: { id: string; status?: string } | null;
}

export interface InterviewQuestionPrep {
  id: string;
  interview_id: string;
  question_text: string;
  candidate_answer: string | null;
  star_method: STARMethod | null;
  ai_feedback: string | null;
  is_practiced: boolean;
  created_at: string;
}

export interface MockInterviewSession {
  id: string;
  candidate_id: string;
  interview_id: string | null;
  session_type: MockSessionType | string | null;
  questions_asked: Array<{ question: string; context?: string }>;
  responses: Array<{ question: string; answer: string; feedback?: string }>;
  ai_feedback: Record<string, unknown> | null;
  overall_score: number | null;
  confidence_score: number | null;
  duration_seconds: number | null;
  completed_at: string | null;
  created_at: string;
}

export interface CompanyResearch {
  overview?: string;
  recentNews?: string[];
  culture?: string[];
  products?: string[];
  competitors?: string[];
  challenges?: string[];
  questionsToAsk?: string[];
}

export interface ThankYouNote {
  subject: string;
  body: string;
}

export interface InterviewPerformance {
  total_interviews: number;
  by_type: Record<string, number>;
  avg_self_assessment: number;
  success_rate: number;
  common_questions: Array<{ question: string; frequency: number }>;
  improvement_areas: string[];
  strengths: string[];
}
